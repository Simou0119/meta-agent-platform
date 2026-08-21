from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import json
from typing import Any

from ..database import get_connection
from .workflow_routing import normalize_routing_configuration, select_route_target


@dataclass(frozen=True)
class ProcessEvent:
    run_id: int
    run_status: str
    activity: str
    agent_id: int | None
    agent_order: int
    status: str
    duration_ms: int | None
    total_tokens: int
    started_at: str | None
    completed_at: str | None
    output: str
    step_id: int


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _load_events(*, workflow_id: int, user_id: int) -> tuple[list[dict[str, Any]], list[ProcessEvent]]:
    with get_connection() as conn:
        run_rows = conn.execute(
            """
            SELECT
                id,
                status,
                duration_ms,
                total_tokens,
                created_at,
                completed_at
            FROM workflow_runs
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (workflow_id, user_id),
        ).fetchall()

        step_rows = conn.execute(
            """
            SELECT
                steps.run_id,
                runs.status,
                steps.agent_name,
                steps.agent_id,
                steps.agent_order,
                steps.status,
                steps.duration_ms,
                steps.total_tokens,
                steps.started_at,
                steps.completed_at,
                steps.output,
                steps.id
            FROM workflow_run_steps AS steps
            INNER JOIN workflow_runs AS runs
                ON runs.id = steps.run_id
            WHERE runs.workflow_id = ?
              AND runs.user_id = ?
            ORDER BY
                steps.run_id ASC,
                COALESCE(steps.started_at, steps.created_at) ASC,
                steps.id ASC
            """,
            (workflow_id, user_id),
        ).fetchall()

    runs = [
        {
            "id": int(row[0]),
            "status": str(row[1]),
            "duration_ms": int(row[2]) if row[2] is not None else None,
            "total_tokens": int(row[3] or 0),
            "created_at": str(row[4]),
            "completed_at": str(row[5]) if row[5] is not None else None,
        }
        for row in run_rows
    ]

    events = [
        ProcessEvent(
            run_id=int(row[0]),
            run_status=str(row[1]),
            activity=str(row[2]),
            agent_id=int(row[3]) if row[3] is not None else None,
            agent_order=int(row[4]),
            status=str(row[5]),
            duration_ms=int(row[6]) if row[6] is not None else None,
            total_tokens=int(row[7] or 0),
            started_at=str(row[8]) if row[8] is not None else None,
            completed_at=str(row[9]) if row[9] is not None else None,
            output=str(row[10] or ""),
            step_id=int(row[11]),
        )
        for row in step_rows
    ]

    return runs, events



def _load_designed_workflow(*, workflow_id: int, user_id: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    with get_connection() as conn:
        workflow_row = conn.execute(
            """
            SELECT routing_configuration_json
            FROM workflows
            WHERE id = ? AND user_id = ?
            """,
            (workflow_id, user_id),
        ).fetchone()
        agent_rows = conn.execute(
            """
            SELECT id, name, agent_order
            FROM agents
            WHERE workflow_id = ? AND user_id = ?
            ORDER BY agent_order ASC, id ASC
            """,
            (workflow_id, user_id),
        ).fetchall()

    try:
        routing_raw = json.loads(workflow_row[0] or "{}") if workflow_row else {}
    except json.JSONDecodeError:
        routing_raw = {}
    routing = normalize_routing_configuration(routing_raw)
    agents = [
        {"id": int(row[0]), "name": str(row[1]), "order": int(row[2])}
        for row in agent_rows
    ]
    return agents, routing


def _classify_deviation(*, current_order: int, expected_order: int | None, observed_order: int | None) -> str:
    if observed_order is None:
        return "missing_activity"
    if observed_order == current_order:
        return "repeated_activity"
    if observed_order < current_order:
        return "out_of_order"
    if expected_order is not None and observed_order > expected_order:
        return "skipped_activity"
    return "unexpected_transition"


def _analyze_conformance(
    *,
    runs: list[dict[str, Any]],
    events_by_run: dict[int, list[ProcessEvent]],
    agents: list[dict[str, Any]],
    routing: dict[str, Any],
) -> dict[str, Any]:
    order_to_name = {int(agent["order"]): str(agent["name"]) for agent in agents}
    ordered_orders = sorted(order_to_name)
    next_sequential = {
        order: (ordered_orders[index + 1] if index + 1 < len(ordered_orders) else None)
        for index, order in enumerate(ordered_orders)
    }

    run_results: list[dict[str, Any]] = []
    deviation_counter: Counter[str] = Counter()
    conformant_count = 0

    for run in runs:
        if run["status"] not in {"completed", "failed"}:
            continue
        run_id = int(run["id"])
        run_events = events_by_run.get(run_id, [])
        if not run_events:
            continue

        deviations: list[dict[str, Any]] = []
        decisions: list[dict[str, Any]] = []

        for index, current in enumerate(run_events):
            observed_next = run_events[index + 1] if index + 1 < len(run_events) else None
            routed_order, matched_rule = select_route_target(
                current_agent_order=current.agent_order,
                current_output=current.output,
                routing=routing,
            )
            expected_order = routed_order if routed_order is not None else next_sequential.get(current.agent_order)
            observed_order = observed_next.agent_order if observed_next is not None else None

            decisions.append({
                "from_activity": current.activity,
                "expected_next": order_to_name.get(expected_order) if expected_order is not None else None,
                "observed_next": observed_next.activity if observed_next is not None else None,
                "matched_rule_label": str((matched_rule or {}).get("label") or ""),
                "matched_rule": matched_rule is not None,
            })

            # Failed runs are allowed to terminate at the failed step.
            if observed_next is None and str(run["status"]) == "failed":
                continue
            if observed_order == expected_order:
                continue
            if expected_order is None and observed_order is None:
                continue

            deviation_type = _classify_deviation(
                current_order=current.agent_order,
                expected_order=expected_order,
                observed_order=observed_order,
            )
            deviation_counter[deviation_type] += 1
            deviations.append({
                "type": deviation_type,
                "after_activity": current.activity,
                "expected_activity": order_to_name.get(expected_order) if expected_order is not None else "END",
                "observed_activity": observed_next.activity if observed_next is not None else "END",
                "detail": (
                    f"After {current.activity}, the designed workflow expected "
                    f"{order_to_name.get(expected_order) if expected_order is not None else 'END'}, "
                    f"but observed {observed_next.activity if observed_next is not None else 'END'}."
                ),
            })

        conformant = not deviations
        if conformant:
            conformant_count += 1
        run_results.append({
            "run_id": run_id,
            "status": str(run["status"]),
            "path": [event.activity for event in run_events],
            "conformant": conformant,
            "deviation_count": len(deviations),
            "deviations": deviations,
            "routing_decisions": decisions,
        })

    checked_runs = len(run_results)
    score = (conformant_count / checked_runs) * 100 if checked_runs else 0
    designed_edges = []
    for order in ordered_orders:
        default_target = next_sequential.get(order)
        if default_target is not None:
            designed_edges.append({
                "source": order_to_name[order],
                "target": order_to_name[default_target],
                "kind": "default",
                "label": "default",
            })
    for rule in routing.get("rules", []):
        source = order_to_name.get(int(rule["from_agent_order"]))
        target = order_to_name.get(int(rule["to_agent_order"]))
        if source and target:
            condition = rule.get("condition", {})
            label = str(rule.get("label") or "").strip() or (
                f"{condition.get('field')} {condition.get('operator')} {condition.get('value')}"
            )
            designed_edges.append({
                "source": source,
                "target": target,
                "kind": "conditional",
                "label": label,
            })

    return {
        "mode": routing.get("mode", "sequential"),
        "checked_runs": checked_runs,
        "conformant_runs": conformant_count,
        "nonconformant_runs": checked_runs - conformant_count,
        "conformance_score": _round(score, 1),
        "designed_path": [order_to_name[order] for order in ordered_orders],
        "designed_edges": designed_edges,
        "deviation_counts": dict(deviation_counter),
        "runs": sorted(run_results, key=lambda item: item["run_id"], reverse=True)[:20],
    }

def analyze_workflow_process(*, workflow_id: int, user_id: int) -> dict[str, Any]:
    """Analyze existing execution history without modifying workflow state or logs."""

    runs, events = _load_events(
        workflow_id=workflow_id,
        user_id=user_id,
    )
    designed_agents, routing = _load_designed_workflow(
        workflow_id=workflow_id,
        user_id=user_id,
    )

    events_by_run: dict[int, list[ProcessEvent]] = defaultdict(list)
    for event in events:
        events_by_run[event.run_id].append(event)

    completed_or_failed_runs = [
        run for run in runs if run["status"] in {"completed", "failed"}
    ]
    completed_runs = [run for run in runs if run["status"] == "completed"]
    failed_runs = [run for run in runs if run["status"] == "failed"]

    variant_counter: Counter[tuple[str, ...]] = Counter()
    variant_run_ids: dict[tuple[str, ...], list[int]] = defaultdict(list)
    variant_statuses: dict[tuple[str, ...], Counter[str]] = defaultdict(Counter)
    direct_follow_counter: Counter[tuple[str, str]] = Counter()

    repeated_run_ids: set[int] = set()
    repeated_activity_counter: Counter[str] = Counter()

    for run in completed_or_failed_runs:
        run_events = events_by_run.get(int(run["id"]), [])
        path = tuple(event.activity for event in run_events)
        if not path:
            continue

        variant_counter[path] += 1
        variant_run_ids[path].append(int(run["id"]))
        variant_statuses[path][str(run["status"])] += 1

        for first, second in zip(path, path[1:]):
            direct_follow_counter[(first, second)] += 1
            if first == second:
                repeated_run_ids.add(int(run["id"]))
                repeated_activity_counter[first] += 1

    analyzed_run_count = sum(variant_counter.values())

    variants = []
    for index, (path, count) in enumerate(
        variant_counter.most_common(10),
        start=1,
    ):
        statuses = variant_statuses[path]
        failed_count = int(statuses.get("failed", 0))
        variants.append(
            {
                "rank": index,
                "path": list(path),
                "count": count,
                "percentage": _round((count / analyzed_run_count) * 100, 1)
                if analyzed_run_count
                else 0,
                "completed_count": int(statuses.get("completed", 0)),
                "failed_count": failed_count,
                "failure_rate": _round((failed_count / count) * 100, 1) if count else 0,
                "run_ids": variant_run_ids[path][:10],
            }
        )

    activity_groups: dict[tuple[int | None, str, int], list[ProcessEvent]] = defaultdict(list)
    for event in events:
        activity_groups[(event.agent_id, event.activity, event.agent_order)].append(event)

    activities = []
    for (agent_id, activity, agent_order), activity_events in activity_groups.items():
        completed_activity_events = [
            event
            for event in activity_events
            if event.status == "completed" and event.duration_ms is not None
        ]
        durations = [float(event.duration_ms) for event in completed_activity_events]
        tokens = [float(event.total_tokens) for event in completed_activity_events]
        failed_count = sum(1 for event in activity_events if event.status == "failed")

        activities.append(
            {
                "agent_id": agent_id,
                "activity": activity,
                "agent_order": agent_order,
                "execution_count": len(activity_events),
                "completed_count": sum(1 for event in activity_events if event.status == "completed"),
                "failed_count": failed_count,
                "failure_rate": _round((failed_count / len(activity_events)) * 100, 1)
                if activity_events
                else 0,
                "average_duration_ms": _round(_average(durations)),
                "average_total_tokens": _round(_average(tokens)),
            }
        )

    activities.sort(
        key=lambda item: (
            -(item["average_duration_ms"] or 0),
            item["agent_order"],
            item["activity"],
        )
    )

    bottleneck = activities[0] if activities and (activities[0]["average_duration_ms"] or 0) > 0 else None

    repeated_rate = (
        (len(repeated_run_ids) / analyzed_run_count) * 100
        if analyzed_run_count
        else 0
    )

    success_rate = (
        (len(completed_runs) / len(completed_or_failed_runs)) * 100
        if completed_or_failed_runs
        else 0
    )

    completed_durations = [
        float(run["duration_ms"])
        for run in completed_runs
        if run["duration_ms"] is not None
    ]
    completed_tokens = [float(run["total_tokens"]) for run in completed_runs]

    issues: list[dict[str, str]] = []
    recommendations: list[dict[str, str]] = []

    if repeated_run_ids:
        repeated_names = ", ".join(name for name, _ in repeated_activity_counter.most_common(3))
        issues.append(
            {
                "type": "repetition",
                "severity": "warning",
                "title": "Repeated agent execution detected",
                "detail": f"{len(repeated_run_ids)} of {analyzed_run_count} analyzed runs contain consecutive repeated agent calls ({repeated_rate:.1f}%)." + (f" Most common: {repeated_names}." if repeated_names else ""),
            }
        )
        recommendations.append(
            {
                "type": "routing",
                "title": "Review repeated agent calls",
                "detail": "Add or tighten a validation/routing condition before re-running the same agent so repetition only occurs when it is necessary.",
            }
        )

    if bottleneck:
        issues.append(
            {
                "type": "bottleneck",
                "severity": "info",
                "title": "Main execution bottleneck",
                "detail": f"{bottleneck['activity']} has the highest average step duration at {bottleneck['average_duration_ms']:.0f} ms.",
            }
        )
        recommendations.append(
            {
                "type": "performance",
                "title": f"Optimize {bottleneck['activity']}",
                "detail": "Review its prompt, context size, model choice, and tool calls before changing the workflow structure.",
            }
        )

    failed_variants = [variant for variant in variants if variant["failed_count"] > 0]
    if failed_variants:
        worst_variant = max(failed_variants, key=lambda item: (item["failure_rate"], item["count"]))
        issues.append(
            {
                "type": "failure_pattern",
                "severity": "warning",
                "title": "Failure-prone execution path",
                "detail": f"The path {' → '.join(worst_variant['path'])} has a {worst_variant['failure_rate']:.1f}% failure rate across {worst_variant['count']} run(s).",
            }
        )
        recommendations.append(
            {
                "type": "reliability",
                "title": "Inspect the failure-prone path",
                "detail": "Compare failed and successful runs on this path before changing agent order or removing a step.",
            }
        )

    if len(variants) > 1:
        issues.append(
            {
                "type": "variation",
                "severity": "info",
                "title": "Multiple execution variants observed",
                "detail": f"The workflow produced {len(variant_counter)} distinct execution path(s). The most common path accounts for {variants[0]['percentage']:.1f}% of analyzed runs." if variants else "Multiple execution paths were observed.",
            }
        )

    if not issues and analyzed_run_count:
        issues.append(
            {
                "type": "stable",
                "severity": "success",
                "title": "No obvious process anomaly detected",
                "detail": "The current execution history does not show repeated consecutive agents or a failure-heavy variant.",
            }
        )

    if not recommendations and analyzed_run_count:
        recommendations.append(
            {
                "type": "observe",
                "title": "Keep collecting execution history",
                "detail": "More runs will make variant, bottleneck, and failure-pattern analysis more reliable.",
            }
        )

    conformance = _analyze_conformance(
        runs=runs,
        events_by_run=events_by_run,
        agents=designed_agents,
        routing=routing,
    )

    direct_follows = [
        {"source": source, "target": target, "count": count}
        for (source, target), count in direct_follow_counter.most_common(30)
    ]

    return {
        "workflow_id": workflow_id,
        "summary": {
            "total_runs": len(runs),
            "analyzed_runs": analyzed_run_count,
            "completed_runs": len(completed_runs),
            "failed_runs": len(failed_runs),
            "success_rate": _round(success_rate, 1),
            "variant_count": len(variant_counter),
            "repeated_run_count": len(repeated_run_ids),
            "repeated_run_rate": _round(repeated_rate, 1),
            "average_duration_ms": _round(_average(completed_durations)),
            "average_total_tokens": _round(_average(completed_tokens)),
        },
        "variants": variants,
        "activities": activities,
        "direct_follows": direct_follows,
        "conformance": conformance,
        "issues": issues,
        "recommendations": recommendations,
    }
