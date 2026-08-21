import json
import re
import time
from collections import defaultdict
from collections.abc import Iterator
from math import sqrt
from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Cookie,
    HTTPException,
)
from fastapi.responses import StreamingResponse

from ..config import (
    OPENAI_MODEL,
    OPENAI_TIMEOUT_SECONDS,
)
from ..database import get_connection
from ..deps import require_current_user
from ..schemas import (
    WorkflowRunDetailResponse,
    WorkflowRunListItem,
    WorkflowRunListResponse,
    WorkflowRunRequest,
    WorkflowRunStepItem,
    WorkflowMetricsResponse,
    WorkflowMetricsSummary,
    WorkflowMetricsTrendItem,
    AgentMetricsItem,
)

from ..services.workflow_graph import (
    AgentExecutionResult,
    WorkflowAgent,
    build_workflow_graph,
    create_initial_state,
    stream_workflow_graph,
)

from ..tools.gmail_tool import (
    GmailToolError,
    create_gmail_draft,
    format_gmail_message_for_workflow,
    read_gmail_message,
    search_gmail_message_by_subject,
    send_gmail_reply,
)

from ..tools.calendar_tool import (
    CalendarToolError,
    cancel_calendar_event,
    create_calendar_event,
    format_calendar_events_for_workflow,
    read_calendar_events,
    resolve_calendar_cancel_request,
    resolve_calendar_create_request,
    resolve_calendar_read_request,
)

from ..services.document_io import (
    build_workflow_input_from_files,
    generate_run_artifacts,
    load_run_artifacts,
)
from ..services.plain_text import format_plain_text


router = APIRouter(
    prefix="/api",
    tags=["workflow-runtime"],
)


def _utc_now() -> str:
    return datetime.now(
        timezone.utc,
    ).isoformat()


def _sse(payload: dict[str, Any]) -> str:
    return (
        "data: "
        f"{json.dumps(payload, ensure_ascii=False)}"
        "\n\n"
    )


def _output_reports_calendar_conflict(
    output: str,
) -> bool:
    """Return True only for explicit calendar-conflict signals.

    This is intentionally conservative so ordinary Agent prose does not
    change workflow routing. JSON and simple key/value output are both
    supported because Agent formatting can vary between runs.
    """
    raw = str(output or "").strip()
    if not raw:
        return False

    candidate = raw
    if candidate.startswith("```"):
        candidate = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            candidate,
            flags=re.IGNORECASE | re.DOTALL,
        ).strip()

    try:
        parsed = json.loads(candidate)
    except (TypeError, ValueError, json.JSONDecodeError):
        parsed = None

    if isinstance(parsed, dict):
        normalized = {
            re.sub(r"[\s-]+", "_", str(key).strip().lower()): value
            for key, value in parsed.items()
        }

        conflict_value = normalized.get(
            "conflict_found"
        )
        if conflict_value is True:
            return True
        if isinstance(conflict_value, str) and (
            conflict_value.strip().lower()
            in {"true", "yes", "1"}
        ):
            return True

        availability_value = str(
            normalized.get(
                "availability_status",
                "",
            )
        ).strip().lower()
        if availability_value in {
            "unavailable",
            "conflict",
            "conflicted",
            "busy",
            "not_available",
        }:
            return True

    lowered = raw.lower()

    explicit_conflict_patterns = (
        r"\bconflict_found\b\s*[:=]\s*(?:true|yes|1)\b",
        r"\bavailability_status\b\s*[:=]\s*(?:unavailable|conflict|conflicted|busy|not[_ -]?available)\b",
        r"\brequested time is not available\b",
        r"\brequested time is unavailable\b",
    )

    return any(
        re.search(pattern, lowered)
        for pattern in explicit_conflict_patterns
    )



def _build_platform_file_output_instructions(
    requested_formats: list[str],
) -> str:
    """
    Tell Agents that binary file creation belongs to the platform backend.

    This prevents the model from inventing filenames, generation statuses,
    environment limitations, or messages such as "DOCX is unavailable".
    """

    normalized_formats = [
        item
        for item in dict.fromkeys(
            str(value).strip().lower()
            for value in requested_formats
        )
        if item in {"docx", "pdf", "bpmn"}
    ]

    if not normalized_formats:
        return ""

    format_names = ", ".join(
        item.upper()
        for item in normalized_formats
    )

    return f"""
Platform-controlled file output rules (mandatory):

- The platform backend, not the Agent, creates the downloadable files.
- Requested backend file formats: {format_names}.
- Produce only the complete, useful content that should be placed in those files.
- Do not claim that a file was generated, not generated, unavailable, failed, or unsupported.
- Do not invent a filename, file path, download link, generation status, or environment limitation.
- Do not return a file-status object containing fields such as File Name, Status, or Reason.
- Do not explain how to generate the files.
- The platform will create the configured files after the Workflow completes and will show real download buttons.
""".strip()


def _average(
    values: list[float],
) -> float | None:
    if not values:
        return None

    return sum(values) / len(values)


def _median(
    values: list[float],
) -> float | None:
    if not values:
        return None

    sorted_values = sorted(values)
    count = len(sorted_values)
    middle = count // 2

    if count % 2 == 1:
        return sorted_values[middle]

    return (
        sorted_values[middle - 1] +
        sorted_values[middle]
    ) / 2


def _percentile(
    values: list[float],
    percentile: float,
) -> float | None:
    if not values:
        return None

    sorted_values = sorted(values)

    if len(sorted_values) == 1:
        return sorted_values[0]

    position = (
        len(sorted_values) - 1
    ) * percentile

    lower_index = int(position)
    upper_index = min(
        lower_index + 1,
        len(sorted_values) - 1,
    )

    weight = position - lower_index

    return (
        sorted_values[lower_index] *
        (1 - weight)
        +
        sorted_values[upper_index] *
        weight
    )


def _population_stddev(
    values: list[float],
) -> float | None:
    if not values:
        return None

    mean_value = sum(values) / len(values)

    variance = sum(
        (
            value - mean_value
        ) ** 2
        for value in values
    ) / len(values)

    return sqrt(variance)


def _round_optional(
    value: float | None,
    digits: int = 2,
) -> float | None:
    if value is None:
        return None

    return round(value, digits)


def _safe_average_int(
    values: list[int],
) -> float:
    if not values:
        return 0

    return round(
        sum(values) / len(values),
        2,
    )


def _load_calendar_read_bindings(
    *,
    workflow_id: int,
    user_id: int,
) -> list[dict[str, Any]]:
    """Load enabled Google Calendar Read Events bindings."""

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                bindings.id,
                bindings.agent_id,
                agents.name,
                agents.role,
                agents.description,
                bindings.tool_type,
                bindings.configuration_json
            FROM agent_tool_bindings AS bindings
            INNER JOIN agents
                ON agents.id = bindings.agent_id
            WHERE bindings.workflow_id = ?
              AND bindings.user_id = ?
              AND bindings.enabled = 1
              AND bindings.tool_type = 'calendar_read'
            ORDER BY bindings.id ASC
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchall()

    bindings: list[dict[str, Any]] = []

    for row in rows:
        try:
            configuration = json.loads(row[6] or "{}")
        except json.JSONDecodeError:
            configuration = {}

        if not isinstance(configuration, dict):
            configuration = {}

        bindings.append(
            {
                "binding_id": int(row[0]),
                "agent_id": int(row[1]),
                "agent_name": str(row[2]),
                "agent_role": str(row[3] or ""),
                "agent_description": str(row[4] or ""),
                "tool_type": str(row[5]),
                "configuration": configuration,
            }
        )

    return bindings



def _is_calendar_availability_binding(binding: dict[str, Any]) -> bool:
    """Return True when a Calendar Read binding is used for availability/conflict checking.

    Availability checks must inspect every event in the requested time range.
    Applying a title query here can hide an existing event with a different title
    and incorrectly report the slot as available.
    """

    configuration = binding.get("configuration") or {}

    if isinstance(configuration, dict) and bool(
        configuration.get("conflict_check")
        or configuration.get("availability_check")
    ):
        return True

    agent_text = " ".join(
        str(binding.get(key) or "")
        for key in ("agent_name", "agent_role", "agent_description")
    ).casefold()

    keywords = (
        "availability",
        "available",
        "conflict",
        "free slot",
        "free time",
        "calendar checker",
    )

    return any(keyword in agent_text for keyword in keywords)



def _parse_event_datetime_for_overlap(
    value: Any,
    *,
    fallback_tz: Any,
) -> datetime | None:
    """Parse a Calendar event boundary for deterministic overlap checks.

    Google may return the same instant with a different UTC offset from the
    request.  We therefore compare timezone-aware datetimes, never raw clock
    strings.  Date-only values are interpreted in the requested timezone.
    """

    text = str(value or "").strip()
    if not text:
        return None

    try:
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=fallback_tz)

    return parsed


def _deterministic_calendar_availability(
    *,
    user_message: str,
    timezone_name: str,
    calendar_result: dict[str, Any],
) -> dict[str, Any] | None:
    """Return an authoritative overlap result when the exact slot is known.

    This deliberately reuses the existing Calendar request parser instead of
    introducing a second date/time grammar.  If the message is not a concrete
    event request, return None so all pre-existing Calendar Read behavior is
    preserved.
    """

    try:
        requested = resolve_calendar_create_request(
            user_message,
            timezone_name=timezone_name,
        )
    except CalendarToolError:
        return None

    requested_start = requested.get("start")
    requested_end = requested.get("end")

    if not isinstance(requested_start, datetime) or not isinstance(
        requested_end,
        datetime,
    ):
        return None

    if requested_start.tzinfo is None or requested_end.tzinfo is None:
        return None

    conflicting_events: list[dict[str, str]] = []

    for event in calendar_result.get("events") or []:
        if not isinstance(event, dict):
            continue

        event_start = _parse_event_datetime_for_overlap(
            event.get("start"),
            fallback_tz=requested_start.tzinfo,
        )
        event_end = _parse_event_datetime_for_overlap(
            event.get("end"),
            fallback_tz=requested_start.tzinfo,
        )

        if event_start is None or event_end is None:
            continue

        # Datetime comparisons use the represented instant, so offsets such as
        # 20:00+08:00 and 14:00+02:00 compare correctly as the same time.
        overlaps = (
            requested_start < event_end
            and requested_end > event_start
        )

        if not overlaps:
            continue

        conflicting_events.append(
            {
                "title": str(event.get("title") or "Untitled event"),
                "start": event_start.astimezone(
                    requested_start.tzinfo
                ).isoformat(),
                "end": event_end.astimezone(
                    requested_start.tzinfo
                ).isoformat(),
            }
        )

    conflict_found = bool(conflicting_events)

    return {
        "conflict_found": conflict_found,
        "availability_status": (
            "unavailable" if conflict_found else "available"
        ),
        "requested_start": requested_start.isoformat(),
        "requested_end": requested_end.isoformat(),
        "timezone": timezone_name,
        "conflicting_event_count": len(conflicting_events),
        "conflicting_events": conflicting_events,
        "decision_source": "deterministic_backend_overlap_check",
    }


def _format_deterministic_availability_context(
    result: dict[str, Any],
) -> str:
    """Format trusted deterministic availability evidence for an Agent."""

    conflict_found = bool(result.get("conflict_found"))
    events = result.get("conflicting_events") or []

    lines = [
        "Deterministic Calendar Availability Result (authoritative)",
        "",
        f"Conflict Found: {'Yes' if conflict_found else 'No'}",
        "Availability Status: "
        + ("unavailable" if conflict_found else "available"),
        f"Requested Start: {result.get('requested_start', '')}",
        f"Requested End: {result.get('requested_end', '')}",
        f"Timezone: {result.get('timezone', '')}",
        f"Conflicting Event Count: {len(events)}",
    ]

    for index, event in enumerate(events, start=1):
        lines.extend(
            [
                "",
                f"Conflict {index}: {event.get('title', '')}",
                f"Start: {event.get('start', '')}",
                f"End: {event.get('end', '')}",
            ]
        )

    lines.extend(
        [
            "",
            "This result was calculated by backend timezone-aware interval "
            "comparison and is authoritative. Do not override it by comparing "
            "displayed clock strings or timezone offsets yourself.",
        ]
    )

    return "\n".join(lines).strip()


def _authoritative_availability_output(
    result: dict[str, Any],
) -> str:
    """Return stable structured output used by conditional workflow routing."""

    payload = {
        "conflict_found": bool(result.get("conflict_found")),
        "availability_status": str(
            result.get("availability_status") or ""
        ),
        "conflicting_event_count": int(
            result.get("conflicting_event_count") or 0
        ),
        "conflicting_events": result.get("conflicting_events") or [],
        "decision_source": "deterministic_backend_overlap_check",
    }

    return json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
    )


def _load_calendar_action_bindings(
    *,
    workflow_id: int,
    user_id: int,
    tool_type: str,
) -> list[dict[str, Any]]:
    """Load one enabled Calendar action binding type."""

    if tool_type not in {
        "calendar_create",
        "calendar_cancel",
    }:
        raise ValueError(
            f"Unsupported Calendar action binding: {tool_type}"
        )

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                bindings.id,
                bindings.agent_id,
                agents.name,
                bindings.tool_type,
                bindings.configuration_json
            FROM agent_tool_bindings AS bindings
            INNER JOIN agents
                ON agents.id = bindings.agent_id
            WHERE bindings.workflow_id = ?
              AND bindings.user_id = ?
              AND bindings.enabled = 1
              AND bindings.tool_type = ?
            ORDER BY bindings.id ASC
            """,
            (
                workflow_id,
                user_id,
                tool_type,
            ),
        ).fetchall()

    bindings: list[dict[str, Any]] = []

    for row in rows:
        try:
            configuration = json.loads(
                row[4] or "{}"
            )
        except json.JSONDecodeError:
            configuration = {}

        if not isinstance(
            configuration,
            dict,
        ):
            configuration = {}

        bindings.append(
            {
                "binding_id": int(row[0]),
                "agent_id": int(row[1]),
                "agent_name": str(row[2]),
                "tool_type": str(row[3]),
                "configuration": configuration,
            }
        )

    return bindings


def _calendar_create_agent_instruction() -> str:
    return """
Google Calendar Create Event action instructions (mandatory):

- This Agent output is connected to the Calendar Create Event action.
- Extract the requested event details from the user request, Gmail message, and Calendar data.
- Do not claim that the event has already been created. The backend performs the real action after this Agent finishes.
- End the output with these exact plain-text fields:

Calendar action: create
Calendar title: <required event title>
Calendar start: <required YYYY-MM-DD HH:MM>
Calendar end: <required YYYY-MM-DD HH:MM>
Calendar location: <optional location>
Calendar description: <optional one-line description>
Calendar attendees: <optional comma-separated email addresses>

- Use the configured Calendar timezone.
- Never invent a date or time when the request does not contain enough information.
- When required details are missing, use `Calendar action: none` and clearly explain what is missing.
""".strip()


def _calendar_cancel_agent_instruction() -> str:
    return """
Google Calendar Cancel Event action instructions (mandatory):

- This Agent output is connected to the Calendar Cancel Event action.
- Do not claim that the event has already been cancelled. The backend performs the real action after this Agent finishes.
- Prefer a Calendar Event ID from Calendar Read Events whenever one is available.
- End the output with one of these exact safe formats:

Calendar action: cancel
Calendar event ID: <exact Event ID>

Or, when no Event ID is available:

Calendar action: cancel
Calendar title: <exact event title>
Calendar date: <required YYYY-MM-DD>
Calendar start: <optional YYYY-MM-DD HH:MM used to disambiguate>

- Never cancel from a vague title alone.
- When the target is unclear, use `Calendar action: none` and explain what information is missing.
""".strip()


def _load_gmail_read_bindings(
    *,
    workflow_id: int,
    user_id: int,
) -> list[dict[str, Any]]:
    """Load enabled Gmail Read Message bindings for a workflow."""

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                bindings.id,
                bindings.agent_id,
                agents.name,
                bindings.tool_type,
                bindings.configuration_json
            FROM agent_tool_bindings AS bindings
            INNER JOIN agents
                ON agents.id = bindings.agent_id
            WHERE bindings.workflow_id = ?
              AND bindings.user_id = ?
              AND bindings.enabled = 1
              AND bindings.tool_type = 'gmail_read'
            ORDER BY bindings.id ASC
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchall()

    bindings: list[dict[str, Any]] = []

    for row in rows:
        try:
            configuration = json.loads(row[4] or "{}")
        except json.JSONDecodeError:
            configuration = {}

        if not isinstance(configuration, dict):
            configuration = {}

        bindings.append(
            {
                "binding_id": int(row[0]),
                "agent_id": int(row[1]),
                "agent_name": str(row[2]),
                "tool_type": str(row[3]),
                "configuration": configuration,
            }
        )

    return bindings


def _extract_gmail_message_id(value: str) -> str:
    """Find a Gmail message ID in a manual workflow request."""

    patterns = [
        r"(?i)Gmail\s+message\s+ID\s*[:：=]\s*([a-zA-Z0-9_-]+)",
        r"(?i)gmail_message_id\s*[:：=]\s*([a-zA-Z0-9_-]+)",
        r"(?im)^\s*Message\s+ID\s*[:：=]\s*([a-zA-Z0-9_-]+)",
        r"(?i)邮件\s*ID\s*[:：=]\s*([a-zA-Z0-9_-]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, value)
        if match:
            return match.group(1).strip()

    return ""


def _extract_gmail_subject(value: str) -> str:
    """Find a Gmail subject/title selector in a manual workflow request."""

    patterns = [
        r"(?im)Gmail\s+(?:subject|title)\s*[:：=]\s*([^\r\n]+)",
        r"(?im)(?:Email|Mail)\s+(?:subject|title)\s*[:：=]\s*([^\r\n]+)",
        r"(?im)^\s*Subject\s*[:：=]\s*([^\r\n]+)",
        r"(?im)(?:邮件标题|邮件主题)\s*[:：=]\s*([^\r\n]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, value)

        if match:
            return match.group(1).strip().strip('"\'')

    return ""


def _load_gmail_draft_bindings(
    *,
    workflow_id: int,
    user_id: int,
) -> list[dict[str, Any]]:
    """
    Load enabled Gmail draft tool bindings for a workflow.

    Supported configuration fields:
    - recipient or to
    - subject
    """

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                bindings.id,
                bindings.agent_id,
                agents.name,
                bindings.tool_type,
                bindings.configuration_json
            FROM agent_tool_bindings AS bindings
            INNER JOIN agents
                ON agents.id = bindings.agent_id
            WHERE bindings.workflow_id = ?
              AND bindings.user_id = ?
              AND bindings.enabled = 1
              AND bindings.tool_type IN (
                  'gmail_create_draft',
                  'gmail_draft'
              )
            ORDER BY bindings.id ASC
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchall()

    bindings: list[dict[str, Any]] = []

    for row in rows:
        configuration_json = row[4] or "{}"

        try:
            configuration = json.loads(
                configuration_json
            )
        except json.JSONDecodeError:
            configuration = {}

        if not isinstance(configuration, dict):
            configuration = {}

        bindings.append(
            {
                "binding_id": int(row[0]),
                "agent_id": int(row[1]),
                "agent_name": str(row[2]),
                "tool_type": str(row[3]),
                "configuration": configuration,
            }
        )

    return bindings


def _load_gmail_send_reply_bindings(
    *,
    workflow_id: int,
    user_id: int,
) -> list[dict[str, Any]]:
    """Load enabled Gmail direct-reply bindings for a workflow."""

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                bindings.id,
                bindings.agent_id,
                agents.name,
                bindings.tool_type,
                bindings.configuration_json
            FROM agent_tool_bindings AS bindings
            INNER JOIN agents
                ON agents.id = bindings.agent_id
            WHERE bindings.workflow_id = ?
              AND bindings.user_id = ?
              AND bindings.enabled = 1
              AND bindings.tool_type IN (
                  'gmail_send_reply',
                  'gmail_reply'
              )
            ORDER BY bindings.id ASC
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchall()

    bindings: list[dict[str, Any]] = []

    for row in rows:
        try:
            configuration = json.loads(row[4] or "{}")
        except json.JSONDecodeError:
            configuration = {}

        if not isinstance(configuration, dict):
            configuration = {}

        bindings.append(
            {
                "binding_id": int(row[0]),
                "agent_id": int(row[1]),
                "agent_name": str(row[2]),
                "tool_type": str(row[3]),
                "configuration": configuration,
            }
        )

    return bindings


def _configuration_flag(
    configuration: dict[str, Any],
    key: str,
) -> bool:
    value = configuration.get(key)

    if isinstance(value, bool):
        return value

    return str(value or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _configuration_bool(
    configuration: dict[str, Any],
    key: str,
    *,
    default: bool,
) -> bool:
    if key not in configuration:
        return default

    value = configuration.get(key)

    if isinstance(value, bool):
        return value

    normalized = str(
        value or ""
    ).strip().lower()

    if normalized in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return True

    if normalized in {
        "0",
        "false",
        "no",
        "off",
    }:
        return False

    return default


def _load_workflow(
    workflow_id: int,
    user_id: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with get_connection() as conn:
        workflow_row = conn.execute(
            """
            SELECT
                id,
                name,
                status,
                input_configuration_json,
                output_configuration_json,
                routing_configuration_json
            FROM workflows
            WHERE id = ?
              AND user_id = ?
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchone()

        if workflow_row is None:
            raise HTTPException(
                status_code=404,
                detail="Workflow not found.",
            )

        agent_rows = conn.execute(
            """
            SELECT
                id,
                name,
                system_prompt,
                role,
                description,
                agent_order
            FROM agents
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY
                agent_order ASC,
                id ASC
            """,
            (
                workflow_id,
                user_id,
            ),
        ).fetchall()

    if not agent_rows:
        raise HTTPException(
            status_code=400,
            detail=(
                "This workflow does not contain "
                "any agents."
            ),
        )

    try:
        input_capabilities = json.loads(workflow_row[3] or "{}")
    except json.JSONDecodeError:
        input_capabilities = {}

    try:
        output_capabilities = json.loads(workflow_row[4] or "{}")
    except json.JSONDecodeError:
        output_capabilities = {}

    try:
        routing = json.loads(workflow_row[5] or "{}")
    except json.JSONDecodeError:
        routing = {}

    if not isinstance(input_capabilities, dict):
        input_capabilities = {}
    if not isinstance(output_capabilities, dict):
        output_capabilities = {}
    if not isinstance(routing, dict):
        routing = {}

    workflow = {
        "id": workflow_row[0],
        "name": workflow_row[1],
        "status": workflow_row[2],
        "input_capabilities": input_capabilities,
        "output_capabilities": output_capabilities,
        "routing": routing,
    }

    agents = [
        {
            "id": row[0],
            "name": row[1],
            "system_prompt": row[2],
            "role": row[3] or "",
            "description": row[4] or "",
            "order": row[5],
        }
        for row in agent_rows
    ]

    return workflow, agents


def _create_run(
    *,
    workflow_id: int,
    user_id: int,
    input_text: str,
) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO workflow_runs (
                workflow_id,
                user_id,
                input_text,
                status,
                model_name
            )
            VALUES (?, ?, ?, 'running', ?)
            """,
            (
                workflow_id,
                user_id,
                input_text,
                OPENAI_MODEL,
            ),
        )

        conn.commit()

        if cursor.lastrowid is None:
            raise RuntimeError(
                "Unable to create workflow run."
            )

        return int(cursor.lastrowid)


def _create_step(
    *,
    run_id: int,
    agent: dict[str, Any],
    input_text: str,
    started_at: str,
) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO workflow_run_steps (
                run_id,
                agent_id,
                agent_name,
                agent_role,
                agent_description,
                agent_order,
                status,
                input_text,
                started_at,
                model_name
            )
            VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
            """,
            (
                run_id,
                agent["id"],
                agent["name"],
                agent["role"],
                agent["description"],
                agent["order"],
                input_text,
                started_at,
                OPENAI_MODEL,
            ),
        )

        conn.commit()

        if cursor.lastrowid is None:
            raise RuntimeError(
                "Unable to create workflow run step."
            )

        return int(cursor.lastrowid)


def _complete_step(
    *,
    step_id: int,
    output: str,
    completed_at: str,
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    model_name: str,
    retry_count: int,
    response_id: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_run_steps
            SET
                status = 'completed',
                output = ?,
                error_message = '',
                completed_at = ?,
                duration_ms = ?,
                input_tokens = ?,
                output_tokens = ?,
                total_tokens = ?,
                model_name = ?,
                retry_count = ?,
                response_id = ?
            WHERE id = ?
            """,
            (
                output,
                completed_at,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                model_name,
                retry_count,
                response_id,
                step_id,
            ),
        )

        conn.commit()


def _fail_step(
    *,
    step_id: int,
    error_message: str,
    completed_at: str,
    duration_ms: int,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_run_steps
            SET
                status = 'failed',
                error_message = ?,
                completed_at = ?,
                duration_ms = ?
            WHERE id = ?
            """,
            (
                error_message,
                completed_at,
                duration_ms,
                step_id,
            ),
        )

        conn.commit()


def _complete_run(
    *,
    run_id: int,
    final_output: str,
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    model_calls: int,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_runs
            SET
                final_output = ?,
                status = 'completed',
                error_message = '',
                duration_ms = ?,
                input_tokens = ?,
                output_tokens = ?,
                total_tokens = ?,
                model_name = ?,
                model_calls = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                final_output,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                OPENAI_MODEL,
                model_calls,
                _utc_now(),
                run_id,
            ),
        )

        conn.commit()


def _fail_run(
    *,
    run_id: int,
    error_message: str,
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    model_calls: int,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE workflow_runs
            SET
                status = 'failed',
                error_message = ?,
                duration_ms = ?,
                input_tokens = ?,
                output_tokens = ?,
                total_tokens = ?,
                model_name = ?,
                model_calls = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                error_message,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                OPENAI_MODEL,
                model_calls,
                _utc_now(),
                run_id,
            ),
        )

        conn.commit()


def _build_runtime_input(
    *,
    original_request: str,
    previous_output: str | None,
    agent_order: int,
    total_agents: int,
) -> str:
    if previous_output:
        return f"""
You are Agent {agent_order} of {total_agents} in a sequential workflow.

Original user request:
{original_request}

Output from the previous agent:
{previous_output}

Use the previous agent output as your main input.
Complete your assigned responsibility according to your system prompt.

Your output will be passed to the next agent.
Return only the useful result of your work.
Do not discuss the workflow execution itself.
""".strip()

    return f"""
You are Agent {agent_order} of {total_agents} in a sequential workflow.

Original user request:
{original_request}

You are the first agent in the workflow.
Complete your assigned responsibility according to your system prompt.

Your output will be passed to the next agent.
Return only the useful result of your work.
Do not discuss the workflow execution itself.
""".strip()


def _run_agent(
    *,
    system_prompt: str,
    runtime_input: str,
    agent_name: str,
    platform_instructions: str = "",
) -> dict[str, Any]:
    try:
        from openai import (
            APITimeoutError,
            OpenAI,
            OpenAIError,
        )
    except ImportError as exc:
        raise RuntimeError(
            "OpenAI SDK is not installed."
        ) from exc

    client = OpenAI(
        timeout=OPENAI_TIMEOUT_SECONDS,
    )

    try:
        effective_instructions = system_prompt.strip()

        if platform_instructions.strip():
            effective_instructions = (
                f"{effective_instructions}\n\n"
                f"{platform_instructions.strip()}"
            )

        response = client.responses.create(
            model=OPENAI_MODEL,
            instructions=effective_instructions,
            input=runtime_input,
        )

        output_text = getattr(
            response,
            "output_text",
            "",
        )

        if (
            not output_text
            or not output_text.strip()
        ):
            raise RuntimeError(
                f'Agent "{agent_name}" returned an empty response.'
            )

        usage = getattr(
            response,
            "usage",
            None,
        )

        input_tokens = int(
            getattr(
                usage,
                "input_tokens",
                0,
            )
            or 0
        )

        output_tokens = int(
            getattr(
                usage,
                "output_tokens",
                0,
            )
            or 0
        )

        total_tokens = int(
            getattr(
                usage,
                "total_tokens",
                input_tokens + output_tokens,
            )
            or (
                input_tokens +
                output_tokens
            )
        )

        return {
            "output": output_text.strip(),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
            "model_name": (
                getattr(
                    response,
                    "model",
                    None,
                )
                or OPENAI_MODEL
            ),
            "response_id": (
                getattr(
                    response,
                    "id",
                    None,
                )
                or ""
            ),
            "retry_count": 0,
        }

    except APITimeoutError as exc:
        raise RuntimeError(
            f'Agent "{agent_name}" timed out.'
        ) from exc

    except OpenAIError as exc:
        raise RuntimeError(
            f'Agent "{agent_name}" is unavailable.'
        ) from exc


def _execute_graph_agent(
    *,
    run_id: int,
    agent: WorkflowAgent,
    original_request: str,
    previous_output: str | None,
    agent_order: int,
    total_agents: int,
    requested_download_formats: list[str],
    tool_context: str = "",
    authoritative_output: str = "",
) -> AgentExecutionResult:
    runtime_input = _build_runtime_input(
        original_request=original_request,
        previous_output=previous_output,
        agent_order=agent_order,
        total_agents=total_agents,
    )

    if tool_context.strip():
        runtime_input = (
            f"{runtime_input}\n\n"
            "Available Gmail Read Message Tool result:\n"
            f"{tool_context.strip()}\n\n"
            "Use this Gmail content as trusted workflow input. "
            "Do not invent missing email fields."
        )

    step_started_at = _utc_now()
    step_started_perf = time.perf_counter()

    step_id = _create_step(
        run_id=run_id,
        agent=agent,
        input_text=runtime_input,
        started_at=step_started_at,
    )

    try:
        result = _run_agent(
            system_prompt=agent[
                "system_prompt"
            ],
            runtime_input=runtime_input,
            agent_name=agent["name"],
            platform_instructions=(
                _build_platform_file_output_instructions(
                    requested_download_formats
                )
            ),
        )

    except Exception as exc:
        error_message = str(exc)

        duration_ms = max(
            0,
            round(
                (
                    time.perf_counter() -
                    step_started_perf
                ) * 1000
            ),
        )

        completed_at = _utc_now()

        _fail_step(
            step_id=step_id,
            error_message=error_message,
            completed_at=completed_at,
            duration_ms=duration_ms,
        )

        return AgentExecutionResult(
            agent_id=agent["id"],
            agent_name=agent["name"],
            agent_order=agent["order"],
            input=runtime_input,
            output="",
            status="failed",
            error=error_message,
            started_at=step_started_at,
            completed_at=completed_at,
            duration_ms=duration_ms,
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            model_name=OPENAI_MODEL,
            retry_count=0,
            response_id="",
        )

    duration_ms = max(
        0,
        round(
            (
                time.perf_counter() -
                step_started_perf
            ) * 1000
        ),
    )

    completed_at = _utc_now()

    output = str(
        result["output"]
    )

    # Exact calendar availability is a deterministic backend fact.  The LLM
    # may explain it, but it must not be allowed to reverse that fact because
    # conditional routing consumes this output.  All other agents retain their
    # original model output unchanged.
    if authoritative_output.strip():
        output = authoritative_output.strip()

    input_tokens = int(
        result["input_tokens"]
    )

    output_tokens = int(
        result["output_tokens"]
    )

    total_tokens = int(
        result["total_tokens"]
    )

    model_name = str(
        result["model_name"]
    )

    retry_count = int(
        result["retry_count"]
    )

    response_id = str(
        result["response_id"]
    )

    _complete_step(
        step_id=step_id,
        output=output,
        completed_at=completed_at,
        duration_ms=duration_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        model_name=model_name,
        retry_count=retry_count,
        response_id=response_id,
    )

    return AgentExecutionResult(
        agent_id=agent["id"],
        agent_name=agent["name"],
        agent_order=agent["order"],
        input=runtime_input,
        output=output,
        status="completed",
        error="",
        started_at=step_started_at,
        completed_at=completed_at,
        duration_ms=duration_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        model_name=model_name,
        retry_count=retry_count,
        response_id=response_id,
    )


def _stream_workflow_run(
    *,
    workflow: dict[str, Any],
    agents: list[dict[str, Any]],
    user_message: str,
    user_id: int,
    display_input: str | None = None,
    gmail_message: dict[str, Any] | None = None,
) -> Iterator[str]:
    run_started_perf = time.perf_counter()

    run_id = _create_run(
        workflow_id=workflow["id"],
        user_id=user_id,
        input_text=(display_input or user_message),
    )

    yield _sse(
        {
            "type": "workflow_started",
            "run_id": run_id,
            "workflow_id": workflow["id"],
            "workflow_name": workflow["name"],
            "agent_count": len(agents),
            "engine": "langgraph",
        }
    )

    output_capabilities = workflow.get(
        "output_capabilities"
    )

    if not isinstance(
        output_capabilities,
        dict,
    ):
        output_capabilities = {}

    raw_requested_formats = (
        output_capabilities.get(
            "download_formats",
            [],
        )
    )

    if not isinstance(
        raw_requested_formats,
        list,
    ):
        raw_requested_formats = []

    requested_download_formats = [
        item
        for item in dict.fromkeys(
            str(value).strip().lower()
            for value in raw_requested_formats
        )
        if item in {
            "docx",
            "pdf",
            "bpmn",
        }
    ]

    tool_results: list[dict[str, Any]] = []
    gmail_tool_inputs: dict[int, list[str]] = defaultdict(list)
    calendar_tool_inputs: dict[int, list[str]] = defaultdict(list)
    calendar_authoritative_outputs: dict[int, str] = {}
    gmail_message_cache: dict[str, dict[str, Any]] = {}
    gmail_subject_cache: dict[str, dict[str, Any]] = {}

    runtime_message_id = ""
    runtime_subject = ""
    primary_gmail_message: dict[str, Any] | None = gmail_message

    if gmail_message:
        runtime_message_id = str(
            gmail_message.get("message_id")
            or gmail_message.get("id")
            or ""
        ).strip()

        if runtime_message_id:
            gmail_message_cache[runtime_message_id] = gmail_message
    else:
        runtime_message_id = _extract_gmail_message_id(user_message)
        runtime_subject = _extract_gmail_subject(user_message)

    gmail_read_bindings = _load_gmail_read_bindings(
        workflow_id=int(workflow["id"]),
        user_id=user_id,
    )

    for binding in gmail_read_bindings:
        configuration = binding["configuration"]
        configured_message_id = str(
            configuration.get("message_id")
            or configuration.get("gmail_message_id")
            or ""
        ).strip()
        configured_subject = str(
            configuration.get("subject")
            or configuration.get("gmail_subject")
            or configuration.get("title")
            or ""
        ).strip()

        message_id = configured_message_id or runtime_message_id
        subject_query = configured_subject or runtime_subject

        yield _sse(
            {
                "type": "tool_started",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "tool_type": "gmail_read",
                "provider": "gmail",
                "action": "read_message",
                "message_id": message_id or None,
                "search_subject": subject_query or None,
            }
        )

        if not message_id and not subject_query:
            error_message = (
                "Gmail Read Message needs either a Gmail message ID or an "
                "email subject for a manual run. Include a line such as "
                "'Gmail message ID: ...' or 'Gmail subject: ...'. With a "
                "Gmail New Message trigger, the triggering message is "
                "supplied automatically."
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "read_message",
                "error": error_message,
            }
            tool_results.append(failed_result)
            gmail_tool_inputs[binding["agent_id"]].append(
                f"Gmail Read Message Tool Error:\n{error_message}"
            )
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        try:
            if message_id:
                message = gmail_message_cache.get(message_id)

                if message is None:
                    message = read_gmail_message(
                        user_id=user_id,
                        message_id=message_id,
                    )
                    gmail_message_cache[message_id] = message
            else:
                normalized_subject = re.sub(
                    r"\s+",
                    " ",
                    subject_query,
                ).strip().casefold()
                message = gmail_subject_cache.get(normalized_subject)

                if message is None:
                    message = search_gmail_message_by_subject(
                        user_id=user_id,
                        subject=subject_query,
                    )
                    gmail_subject_cache[normalized_subject] = message

                message_id = str(
                    message.get("message_id")
                    or message.get("id")
                    or ""
                ).strip()

                if message_id:
                    gmail_message_cache[message_id] = message

            formatted_message = format_gmail_message_for_workflow(message)
            gmail_tool_inputs[binding["agent_id"]].append(formatted_message)

            if primary_gmail_message is None:
                primary_gmail_message = message

        except GmailToolError as exc:
            error_message = str(exc)
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "read_message",
                "message_id": message_id or None,
                "search_subject": subject_query or None,
                "error": error_message,
            }
            tool_results.append(failed_result)
            gmail_tool_inputs[binding["agent_id"]].append(
                f"Gmail Read Message Tool Error:\n{error_message}"
            )
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        completed_result = {
            "success": True,
            "binding_id": binding["binding_id"],
            "agent_id": binding["agent_id"],
            "agent_name": binding["agent_name"],
            "provider": "gmail",
            "action": "read_message",
            "message_id": str(
                message.get("message_id")
                or message.get("id")
                or message_id
                or ""
            ),
            "search_subject": subject_query or None,
            "thread_id": str(message.get("thread_id") or ""),
            "from": str(message.get("from") or ""),
            "subject": str(message.get("subject") or ""),
            "account_email": str(message.get("account_email") or ""),
            "has_attachment": bool(message.get("has_attachment")),
            "attachment_count": len(message.get("attachments") or []),
            "output": formatted_message,
        }
        tool_results.append(completed_result)

        yield _sse(
            {
                "type": "tool_completed",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                **completed_result,
            }
        )

    calendar_read_bindings = _load_calendar_read_bindings(
        workflow_id=int(workflow["id"]),
        user_id=user_id,
    )

    for binding in calendar_read_bindings:
        configuration = binding["configuration"]
        timezone_name = str(
            configuration.get("timezone")
            or "Europe/Berlin"
        ).strip()
        calendar_id = str(
            configuration.get("calendar_id")
            or "primary"
        ).strip()
        max_results = int(
            configuration.get("max_results")
            or 50
        )

        try:
            request = resolve_calendar_read_request(
                user_message,
                timezone_name=timezone_name,
            )

            if calendar_id:
                request["calendar_id"] = calendar_id

            # Availability/conflict checks must inspect all events in the
            # requested date range. A title filter would hide events with a
            # different title (for example, Anna's event while checking
            # David's request at the same time).
            effective_title_query = (
                ""
                if _is_calendar_availability_binding(binding)
                else str(request.get("title_query") or "")
            )

        except CalendarToolError as exc:
            error_message = str(exc)
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "google_calendar",
                "action": "read_events",
                "error": error_message,
            }
            tool_results.append(failed_result)
            calendar_tool_inputs[binding["agent_id"]].append(
                f"Google Calendar Read Events Tool Error:\n{error_message}"
            )

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        yield _sse(
            {
                "type": "tool_started",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "tool_type": "calendar_read",
                "provider": "google_calendar",
                "action": "read_events",
                "range_start": request["time_min"].isoformat(),
                "range_end": request["time_max"].isoformat(),
                "search_query": effective_title_query or None,
            }
        )

        try:
            calendar_result = read_calendar_events(
                user_id=user_id,
                time_min=request["time_min"],
                time_max=request["time_max"],
                title_query=effective_title_query,
                calendar_id=request["calendar_id"],
                max_results=max_results,
            )
            formatted_calendar = (
                format_calendar_events_for_workflow(
                    calendar_result
                )
            )
            calendar_tool_inputs[
                binding["agent_id"]
            ].append(formatted_calendar)

            if _is_calendar_availability_binding(binding):
                deterministic_result = (
                    _deterministic_calendar_availability(
                        user_message=user_message,
                        timezone_name=timezone_name,
                        calendar_result=calendar_result,
                    )
                )

                if deterministic_result is not None:
                    calendar_tool_inputs[
                        binding["agent_id"]
                    ].append(
                        _format_deterministic_availability_context(
                            deterministic_result
                        )
                    )
                    calendar_authoritative_outputs[
                        int(binding["agent_id"])
                    ] = _authoritative_availability_output(
                        deterministic_result
                    )

        except CalendarToolError as exc:
            error_message = str(exc)
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "google_calendar",
                "action": "read_events",
                "range_start": request["time_min"].isoformat(),
                "range_end": request["time_max"].isoformat(),
                "search_query": effective_title_query or None,
                "error": error_message,
            }
            tool_results.append(failed_result)
            calendar_tool_inputs[binding["agent_id"]].append(
                f"Google Calendar Read Events Tool Error:\n{error_message}"
            )

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        completed_result = {
            **calendar_result,
            "binding_id": binding["binding_id"],
            "agent_id": binding["agent_id"],
            "agent_name": binding["agent_name"],
            "range_start": calendar_result["time_min"],
            "range_end": calendar_result["time_max"],
            "search_query": calendar_result["title_query"] or None,
            "output": formatted_calendar,
        }
        tool_results.append(completed_result)

        yield _sse(
            {
                "type": "tool_completed",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                **completed_result,
            }
        )

    calendar_create_bindings = (
        _load_calendar_action_bindings(
            workflow_id=int(
                workflow["id"]
            ),
            user_id=user_id,
            tool_type=(
                "calendar_create"
            ),
        )
    )

    calendar_cancel_bindings = (
        _load_calendar_action_bindings(
            workflow_id=int(
                workflow["id"]
            ),
            user_id=user_id,
            tool_type=(
                "calendar_cancel"
            ),
        )
    )

    for binding in (
        calendar_create_bindings
    ):
        calendar_tool_inputs[
            int(binding["agent_id"])
        ].append(
            _calendar_create_agent_instruction()
        )

    for binding in (
        calendar_cancel_bindings
    ):
        calendar_tool_inputs[
            int(binding["agent_id"])
        ].append(
            _calendar_cancel_agent_instruction()
        )

    graph_agents: list[
        WorkflowAgent
    ] = [
        WorkflowAgent(
            id=int(agent["id"]),
            name=str(agent["name"]),
            system_prompt=str(
                agent["system_prompt"]
            ),
            role=str(
                agent["role"]
            ),
            description=str(
                agent["description"]
            ),
            order=int(
                agent["order"]
            ),
        )
        for agent in agents
    ]

    def execute_agent(
        agent: WorkflowAgent,
        original_request: str,
        previous_output: str | None,
        agent_order: int,
        total_agents: int,
    ) -> AgentExecutionResult:
        return _execute_graph_agent(
            run_id=run_id,
            agent=agent,
            original_request=original_request,
            previous_output=previous_output,
            agent_order=agent_order,
            total_agents=total_agents,
            requested_download_formats=(
                requested_download_formats
            ),
            tool_context="\n\n".join(
                [
                    *gmail_tool_inputs.get(
                        int(agent["id"]),
                        [],
                    ),
                    *calendar_tool_inputs.get(
                        int(agent["id"]),
                        [],
                    ),
                ]
            ),
            authoritative_output=(
                calendar_authoritative_outputs.get(
                    int(agent["id"]),
                    "",
                )
            ),
        )

    calendar_create_agent_ids = {
        int(binding["agent_id"])
        for binding in calendar_create_bindings
    }

    def should_skip_agent(
        agent: WorkflowAgent,
        state: dict[str, Any],
    ) -> bool:
        if (
            int(agent["id"])
            not in calendar_create_agent_ids
        ):
            return False

        return _output_reports_calendar_conflict(
            str(state.get("current_output") or "")
        )

    graph = build_workflow_graph(
        agents=graph_agents,
        execute_agent=execute_agent,
        routing=workflow.get("routing"),
        # Legacy calendar fallback keeps older published workflows compatible.
        should_skip_agent=should_skip_agent,
    )

    initial_state = create_initial_state(
        workflow_id=workflow["id"],
        run_id=run_id,
        original_request=user_message,
    )

    run_input_tokens = 0
    run_output_tokens = 0
    run_total_tokens = 0
    model_calls = 0
    final_output = ""
    agent_outputs: dict[int, str] = {}

    for graph_event in (
        stream_workflow_graph(
            graph=graph,
            initial_state=initial_state,
        )
    ):
        result = graph_event["result"]

        model_calls += 1
        run_input_tokens += int(
            result["input_tokens"]
        )
        run_output_tokens += int(
            result["output_tokens"]
        )
        run_total_tokens += int(
            result["total_tokens"]
        )

        if (
            result["status"] ==
            "completed"
        ):
            completed_output = str(
                result["output"]
            )

            final_output = completed_output

            agent_outputs[
                int(result["agent_id"])
            ] = completed_output

            yield _sse(
                {
                    "type": "agent_completed",
                    "engine": "langgraph",
                    "node_name": graph_event[
                        "node_name"
                    ],
                    "run_id": run_id,
                    "agent_id": result[
                        "agent_id"
                    ],
                    "agent_name": result[
                        "agent_name"
                    ],
                    "order": result[
                        "agent_order"
                    ],
                    "output": format_plain_text(
                        str(result["output"])
                    ),
                    "duration_ms": result[
                        "duration_ms"
                    ],
                    "input_tokens": result[
                        "input_tokens"
                    ],
                    "output_tokens": result[
                        "output_tokens"
                    ],
                    "total_tokens": result[
                        "total_tokens"
                    ],
                    "model_name": result[
                        "model_name"
                    ],
                    "started_at": result[
                        "started_at"
                    ],
                    "completed_at": result[
                        "completed_at"
                    ],
                }
            )

            continue

        run_duration_ms = max(
            0,
            round(
                (
                    time.perf_counter() -
                    run_started_perf
                ) * 1000
            ),
        )

        error_message = result[
            "error"
        ]

        _fail_run(
            run_id=run_id,
            error_message=error_message,
            duration_ms=run_duration_ms,
            input_tokens=run_input_tokens,
            output_tokens=run_output_tokens,
            total_tokens=run_total_tokens,
            model_calls=model_calls,
        )

        yield _sse(
            {
                "type": "agent_failed",
                "engine": "langgraph",
                "node_name": graph_event[
                    "node_name"
                ],
                "run_id": run_id,
                "agent_id": result[
                    "agent_id"
                ],
                "agent_name": result[
                    "agent_name"
                ],
                "order": result[
                    "agent_order"
                ],
                "error": error_message,
                "duration_ms": result[
                    "duration_ms"
                ],
                "started_at": result[
                    "started_at"
                ],
                "completed_at": result[
                    "completed_at"
                ],
            }
        )

        yield _sse(
            {
                "type": "workflow_failed",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "error": error_message,
                "duration_ms": run_duration_ms,
                "input_tokens": run_input_tokens,
                "output_tokens": run_output_tokens,
                "total_tokens": run_total_tokens,
                "model_calls": model_calls,
            }
        )

        return

    executed_agent_ids = set(agent_outputs.keys())
    all_agent_ids = {int(agent["id"]) for agent in graph_agents}
    skipped_agent_ids = all_agent_ids - executed_agent_ids
    skipped_calendar_create_agent_ids = calendar_create_agent_ids & skipped_agent_ids

    for agent in graph_agents:
        agent_id = int(agent["id"])
        if agent_id not in skipped_agent_ids:
            continue
        yield _sse(
            {
                "type": "agent_skipped",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "agent_id": agent_id,
                "agent_name": agent["name"],
                "order": agent["order"],
                "reason": "conditional_routing",
                "message": "Skipped by the selected conditional workflow path.",
            }
        )

    final_output = format_plain_text(
        final_output
    )

    calendar_action_failed = False

    if (
        calendar_create_bindings
        and calendar_cancel_bindings
    ):
        calendar_action_failed = True

        error_message = (
            "Google Calendar Create Event and Cancel Event cannot run "
            "in the same workflow execution."
        )

        for binding in [
            *calendar_create_bindings,
            *calendar_cancel_bindings,
        ]:
            action_name = (
                "create_event"
                if binding["tool_type"] ==
                "calendar_create"
                else "cancel_event"
            )

            failed_result = {
                "success": False,
                "binding_id": binding[
                    "binding_id"
                ],
                "agent_id": binding[
                    "agent_id"
                ],
                "agent_name": binding[
                    "agent_name"
                ],
                "provider": (
                    "google_calendar"
                ),
                "action": action_name,
                "error": error_message,
            }
            tool_results.append(
                failed_result
            )
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow[
                        "id"
                    ],
                    **failed_result,
                }
            )

    else:
        for binding in (
            calendar_create_bindings
        ):
            configuration = binding[
                "configuration"
            ]
            binding_agent_id = int(
                binding["agent_id"]
            )

            if (
                binding_agent_id
                in skipped_calendar_create_agent_ids
            ):
                skipped_result = {
                    "success": True,
                    "skipped": True,
                    "binding_id": binding["binding_id"],
                    "agent_id": binding_agent_id,
                    "agent_name": binding["agent_name"],
                    "provider": "google_calendar",
                    "action": "create_event",
                    "reason": "conditional_routing",
                    "message": (
                        "Calendar creation was skipped because its Agent "
                        "was not executed on the selected workflow path."
                    ),
                }
                tool_results.append(
                    skipped_result
                )
                yield _sse(
                    {
                        "type": "tool_skipped",
                        "engine": "langgraph",
                        "run_id": run_id,
                        "workflow_id": workflow["id"],
                        **skipped_result,
                    }
                )
                continue

            yield _sse(
                {
                    "type": "tool_started",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow[
                        "id"
                    ],
                    "binding_id": binding[
                        "binding_id"
                    ],
                    "agent_id": binding[
                        "agent_id"
                    ],
                    "agent_name": binding[
                        "agent_name"
                    ],
                    "tool_type": (
                        "calendar_create"
                    ),
                    "provider": (
                        "google_calendar"
                    ),
                    "action": "create_event",
                }
            )

            try:
                if not _configuration_flag(
                    configuration,
                    "confirm_calendar_create",
                ):
                    raise CalendarToolError(
                        "Calendar event creation was not explicitly "
                        "confirmed when the workflow was published."
                    )

                selected_output = (
                    agent_outputs.get(
                        int(binding["agent_id"]),
                        final_output,
                    )
                )
                action_source = (
                    f"{selected_output}\n\n"
                    "Original user request:\n"
                    f"{user_message}"
                )
                timezone_name = str(
                    configuration.get(
                        "timezone"
                    )
                    or "Europe/Berlin"
                ).strip()
                calendar_id = str(
                    configuration.get(
                        "calendar_id"
                    )
                    or "primary"
                ).strip()

                request = (
                    resolve_calendar_create_request(
                        action_source,
                        timezone_name=(
                            timezone_name
                        ),
                    )
                )
                request["timezone"] = (
                    timezone_name
                )
                request["calendar_id"] = (
                    calendar_id
                )

                calendar_result = (
                    create_calendar_event(
                        user_id=user_id,
                        title=request["title"],
                        start=request["start"],
                        end=request["end"],
                        timezone_name=request[
                            "timezone"
                        ],
                        calendar_id=request[
                            "calendar_id"
                        ],
                        location=request[
                            "location"
                        ],
                        description=request[
                            "description"
                        ],
                        attendees=request[
                            "attendees"
                        ],
                        block_on_conflict=(
                            _configuration_bool(
                                configuration,
                                "block_on_conflict",
                                default=True,
                            )
                        ),
                        send_updates=str(
                            configuration.get(
                                "send_updates"
                            )
                            or "all"
                        ),
                    )
                )

            except CalendarToolError as exc:
                calendar_action_failed = True
                failed_result = {
                    "success": False,
                    "binding_id": binding[
                        "binding_id"
                    ],
                    "agent_id": binding[
                        "agent_id"
                    ],
                    "agent_name": binding[
                        "agent_name"
                    ],
                    "provider": (
                        "google_calendar"
                    ),
                    "action": "create_event",
                    "error": str(exc),
                }
                tool_results.append(
                    failed_result
                )
                yield _sse(
                    {
                        "type": "tool_failed",
                        "engine": "langgraph",
                        "run_id": run_id,
                        "workflow_id": workflow[
                            "id"
                        ],
                        **failed_result,
                    }
                )
                continue

            completed_result = {
                **calendar_result,
                "binding_id": binding[
                    "binding_id"
                ],
                "agent_id": binding[
                    "agent_id"
                ],
                "agent_name": binding[
                    "agent_name"
                ],
            }
            tool_results.append(
                completed_result
            )
            yield _sse(
                {
                    "type": (
                        "tool_completed"
                    ),
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow[
                        "id"
                    ],
                    **completed_result,
                }
            )

        for binding in (
            calendar_cancel_bindings
        ):
            binding_agent_id = int(binding["agent_id"])
            if binding_agent_id in skipped_agent_ids:
                skipped_result = {
                    "success": True, "skipped": True,
                    "binding_id": binding["binding_id"],
                    "agent_id": binding_agent_id,
                    "agent_name": binding["agent_name"],
                    "provider": "google_calendar", "action": "cancel_event",
                    "reason": "conditional_routing",
                    "message": "Calendar cancellation was skipped because its Agent was not executed.",
                }
                tool_results.append(skipped_result)
                yield _sse({"type": "tool_skipped", "engine": "langgraph", "run_id": run_id, "workflow_id": workflow["id"], **skipped_result})
                continue

            configuration = binding[
                "configuration"
            ]

            yield _sse(
                {
                    "type": "tool_started",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow[
                        "id"
                    ],
                    "binding_id": binding[
                        "binding_id"
                    ],
                    "agent_id": binding[
                        "agent_id"
                    ],
                    "agent_name": binding[
                        "agent_name"
                    ],
                    "tool_type": (
                        "calendar_cancel"
                    ),
                    "provider": (
                        "google_calendar"
                    ),
                    "action": "cancel_event",
                }
            )

            try:
                if not _configuration_flag(
                    configuration,
                    "confirm_calendar_cancel",
                ):
                    raise CalendarToolError(
                        "Calendar event cancellation was not explicitly "
                        "confirmed when the workflow was published."
                    )

                selected_output = (
                    agent_outputs.get(
                        int(binding["agent_id"]),
                        final_output,
                    )
                )
                action_source = (
                    f"{selected_output}\n\n"
                    "Original user request:\n"
                    f"{user_message}"
                )
                timezone_name = str(
                    configuration.get(
                        "timezone"
                    )
                    or "Europe/Berlin"
                ).strip()
                calendar_id = str(
                    configuration.get(
                        "calendar_id"
                    )
                    or "primary"
                ).strip()

                request = (
                    resolve_calendar_cancel_request(
                        action_source,
                        timezone_name=(
                            timezone_name
                        ),
                    )
                )
                request["timezone"] = (
                    timezone_name
                )
                request["calendar_id"] = (
                    calendar_id
                )

                calendar_result = (
                    cancel_calendar_event(
                        user_id=user_id,
                        calendar_id=request[
                            "calendar_id"
                        ],
                        timezone_name=request[
                            "timezone"
                        ],
                        event_id=request[
                            "event_id"
                        ],
                        title=request["title"],
                        event_date=request[
                            "date"
                        ],
                        start=request["start"],
                        send_updates=str(
                            configuration.get(
                                "send_updates"
                            )
                            or "all"
                        ),
                    )
                )

            except CalendarToolError as exc:
                calendar_action_failed = True
                failed_result = {
                    "success": False,
                    "binding_id": binding[
                        "binding_id"
                    ],
                    "agent_id": binding[
                        "agent_id"
                    ],
                    "agent_name": binding[
                        "agent_name"
                    ],
                    "provider": (
                        "google_calendar"
                    ),
                    "action": "cancel_event",
                    "error": str(exc),
                }
                tool_results.append(
                    failed_result
                )
                yield _sse(
                    {
                        "type": "tool_failed",
                        "engine": "langgraph",
                        "run_id": run_id,
                        "workflow_id": workflow[
                            "id"
                        ],
                        **failed_result,
                    }
                )
                continue

            completed_result = {
                **calendar_result,
                "binding_id": binding[
                    "binding_id"
                ],
                "agent_id": binding[
                    "agent_id"
                ],
                "agent_name": binding[
                    "agent_name"
                ],
            }
            tool_results.append(
                completed_result
            )
            yield _sse(
                {
                    "type": (
                        "tool_completed"
                    ),
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow[
                        "id"
                    ],
                    **completed_result,
                }
            )

    gmail_bindings = _load_gmail_draft_bindings(
        workflow_id=int(workflow["id"]),
        user_id=user_id,
    )

    for binding in gmail_bindings:
        binding_agent_id = int(binding["agent_id"])
        if binding_agent_id in skipped_agent_ids:
            skipped_result = {
                "success": True, "skipped": True,
                "binding_id": binding["binding_id"],
                "agent_id": binding_agent_id, "agent_name": binding["agent_name"],
                "provider": "gmail", "action": "create_draft",
                "reason": "conditional_routing",
                "message": "Gmail draft creation was skipped because its Agent was not executed.",
            }
            tool_results.append(skipped_result)
            yield _sse({"type": "tool_skipped", "engine": "langgraph", "run_id": run_id, "workflow_id": workflow["id"], **skipped_result})
            continue

        configuration = binding["configuration"]

        recipient = str(
            configuration.get("recipient")
            or configuration.get("to")
            or ""
        ).strip()

        subject = str(
            configuration.get("subject")
            or f'{workflow["name"]} Workflow Result'
        ).strip()

        tool_body = format_plain_text(
            agent_outputs.get(
                int(binding["agent_id"]),
                final_output,
            )
        )

        yield _sse(
            {
                "type": "tool_started",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "tool_type": "gmail_create_draft",
                "action": "create_draft",
            }
        )

        if not recipient:
            error_message = (
                "Gmail draft recipient is not configured."
            )

            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "create_draft",
                "error": error_message,
            }

            tool_results.append(failed_result)

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )

            continue

        if not tool_body.strip():
            error_message = (
                "The selected Agent did not produce any output."
            )

            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "create_draft",
                "error": error_message,
            }

            tool_results.append(failed_result)

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )

            continue

        try:
            gmail_result = create_gmail_draft(
                user_id=user_id,
                to=recipient,
                subject=subject,
                body=tool_body,
            )

        except GmailToolError as exc:
            error_message = str(exc)

            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "create_draft",
                "error": error_message,
            }

            tool_results.append(failed_result)

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )

            continue

        except Exception as exc:
            error_message = (
                "Unexpected Gmail Tool error: "
                f"{exc}"
            )

            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "create_draft",
                "error": error_message,
            }

            tool_results.append(failed_result)

            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )

            continue

        completed_result = {
            **gmail_result,
            "binding_id": binding["binding_id"],
            "agent_id": binding["agent_id"],
            "agent_name": binding["agent_name"],
        }

        tool_results.append(completed_result)

        yield _sse(
            {
                "type": "tool_completed",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                **completed_result,
            }
        )

    gmail_reply_bindings = _load_gmail_send_reply_bindings(
        workflow_id=int(workflow["id"]),
        user_id=user_id,
    )

    for binding in gmail_reply_bindings:
        binding_agent_id = int(binding["agent_id"])
        if binding_agent_id in skipped_agent_ids:
            skipped_result = {
                "success": True, "skipped": True,
                "binding_id": binding["binding_id"],
                "agent_id": binding_agent_id, "agent_name": binding["agent_name"],
                "provider": "gmail", "action": "send_reply",
                "reason": "conditional_routing",
                "message": "Gmail reply was skipped because its Agent was not executed.",
            }
            tool_results.append(skipped_result)
            yield _sse({"type": "tool_skipped", "engine": "langgraph", "run_id": run_id, "workflow_id": workflow["id"], **skipped_result})
            continue

        configuration = binding["configuration"]
        reply_body = format_plain_text(
            agent_outputs.get(
                int(binding["agent_id"]),
                final_output,
            )
        )

        yield _sse(
            {
                "type": "tool_started",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "tool_type": "gmail_send_reply",
                "provider": "gmail",
                "action": "send_reply",
            }
        )

        if calendar_action_failed:
            error_message = (
                "Gmail reply was not sent because the configured "
                "Google Calendar action failed."
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        if gmail_bindings:
            error_message = (
                "Gmail Create Draft and Gmail Send Reply cannot run "
                "in the same workflow execution."
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        if not _configuration_flag(
            configuration,
            "confirm_send",
        ):
            error_message = (
                "Direct Gmail reply was not explicitly confirmed "
                "when the workflow was published."
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        if not reply_body.strip():
            error_message = (
                "The selected Agent did not produce a reply body."
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        try:
            target_message = primary_gmail_message

            if target_message is None and runtime_message_id:
                target_message = gmail_message_cache.get(
                    runtime_message_id
                )

                if target_message is None:
                    target_message = read_gmail_message(
                        user_id=user_id,
                        message_id=runtime_message_id,
                    )
                    gmail_message_cache[
                        runtime_message_id
                    ] = target_message

            if target_message is None and runtime_subject:
                normalized_subject = re.sub(
                    r"\s+",
                    " ",
                    runtime_subject,
                ).strip().casefold()
                target_message = gmail_subject_cache.get(
                    normalized_subject
                )

                if target_message is None:
                    target_message = search_gmail_message_by_subject(
                        user_id=user_id,
                        subject=runtime_subject,
                    )
                    gmail_subject_cache[
                        normalized_subject
                    ] = target_message

            if target_message is None:
                raise GmailToolError(
                    "Gmail Send Reply needs the original email. "
                    "Use a Gmail New Message trigger, or provide a Gmail "
                    "message ID or email subject in a manual run."
                )

            gmail_result = send_gmail_reply(
                user_id=user_id,
                original_message=target_message,
                body=reply_body,
            )

        except GmailToolError as exc:
            error_message = str(exc)
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        except Exception as exc:
            error_message = (
                "Unexpected Gmail Send Reply error: "
                f"{exc}"
            )
            failed_result = {
                "success": False,
                "binding_id": binding["binding_id"],
                "agent_id": binding["agent_id"],
                "agent_name": binding["agent_name"],
                "provider": "gmail",
                "action": "send_reply",
                "error": error_message,
            }
            tool_results.append(failed_result)
            yield _sse(
                {
                    "type": "tool_failed",
                    "engine": "langgraph",
                    "run_id": run_id,
                    "workflow_id": workflow["id"],
                    **failed_result,
                }
            )
            continue

        completed_result = {
            **gmail_result,
            "binding_id": binding["binding_id"],
            "agent_id": binding["agent_id"],
            "agent_name": binding["agent_name"],
        }
        tool_results.append(completed_result)

        yield _sse(
            {
                "type": "tool_completed",
                "engine": "langgraph",
                "run_id": run_id,
                "workflow_id": workflow["id"],
                **completed_result,
            }
        )

    run_duration_ms = max(
        0,
        round(
            (
                time.perf_counter() -
                run_started_perf
            ) * 1000
        ),
    )

    _complete_run(
        run_id=run_id,
        final_output=final_output,
        duration_ms=run_duration_ms,
        input_tokens=run_input_tokens,
        output_tokens=run_output_tokens,
        total_tokens=run_total_tokens,
        model_calls=model_calls,
    )

    requested_formats = (
        requested_download_formats
    )

    artifacts: list[dict[str, Any]] = []
    artifact_error = ""

    if requested_formats:
        try:
            artifacts = generate_run_artifacts(
                run_id=run_id,
                workflow_id=int(workflow["id"]),
                user_id=user_id,
                workflow_name=str(workflow["name"]),
                agents=agents,
                final_output=final_output,
                formats=[str(item) for item in requested_formats],
            )
        except Exception as exc:
            artifact_error = str(exc)
            artifacts = load_run_artifacts(
                run_id=run_id,
                workflow_id=int(workflow["id"]),
                user_id=user_id,
            )

    yield _sse(
        {
            "type": "workflow_completed",
            "engine": "langgraph",
            "run_id": run_id,
            "workflow_id": workflow["id"],
            "workflow_name": workflow["name"],
            "final_agent_id": agents[-1]["id"],
            "final_agent_name": agents[-1]["name"],
            "final_output": final_output,
            "duration_ms": run_duration_ms,
            "input_tokens": run_input_tokens,
            "output_tokens": run_output_tokens,
            "total_tokens": run_total_tokens,
            "model_calls": model_calls,
            "tools": tool_results,
            "artifacts": artifacts,
            "artifact_error": artifact_error,
        }
    )


@router.post(
    "/workflows/{workflow_id}/run",
)
def run_workflow(
    workflow_id: int,
    request: WorkflowRunRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> StreamingResponse:
    user = require_current_user(
        agentdemo_session,
    )

    user_message = request.message.strip()

    if not user_message and not request.file_ids:
        raise HTTPException(
            status_code=400,
            detail="Enter a message or upload a file.",
        )

    workflow, agents = _load_workflow(
        workflow_id,
        user["id"],
    )

    runtime_input, display_input = build_workflow_input_from_files(
        workflow_id=workflow_id,
        user_id=user["id"],
        message=user_message,
        file_ids=request.file_ids,
    )

    return StreamingResponse(
        _stream_workflow_run(
            workflow=workflow,
            agents=agents,
            user_message=runtime_input,
            user_id=user["id"],
            display_input=display_input,
        ),
        media_type=(
            "text/event-stream; charset=utf-8"
        ),
    )


@router.get(
    "/workflows/{workflow_id}/runs",
    response_model=WorkflowRunListResponse,
)
def list_workflow_runs(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> WorkflowRunListResponse:
    user = require_current_user(
        agentdemo_session,
    )

    _load_workflow(
        workflow_id,
        user["id"],
    )

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                runs.id,
                (
                    SELECT COUNT(*)
                    FROM workflow_runs AS numbered_runs
                    WHERE numbered_runs.workflow_id = runs.workflow_id
                      AND numbered_runs.user_id = runs.user_id
                      AND (
                          numbered_runs.created_at < runs.created_at
                          OR (
                              numbered_runs.created_at = runs.created_at
                              AND numbered_runs.id <= runs.id
                          )
                      )
                ) AS display_number,
                runs.workflow_id,
                runs.input_text,
                final_output,
                status,
                error_message,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                model_name,
                model_calls,
                created_at,
                completed_at
            FROM workflow_runs AS runs
            WHERE runs.workflow_id = ?
              AND runs.user_id = ?
            ORDER BY
                runs.created_at DESC,
                runs.id DESC
            LIMIT 100
            """,
            (
                workflow_id,
                user["id"],
            ),
        ).fetchall()

    return WorkflowRunListResponse(
        runs=[
            WorkflowRunListItem(
                id=row[0],
                display_number=row[1],
                workflow_id=row[2],
                input=row[3],
                final_output=row[4] or "",
                status=row[5],
                error=row[6] or "",
                duration_ms=row[7],
                input_tokens=row[8] or 0,
                output_tokens=row[9] or 0,
                total_tokens=row[10] or 0,
                model_name=row[11] or "",
                model_calls=row[12] or 0,
                created_at=row[13],
                completed_at=row[14],
                artifacts=load_run_artifacts(
                    run_id=int(row[0]),
                    workflow_id=workflow_id,
                    user_id=user["id"],
                ),
            )
            for row in rows
        ]
    )


@router.get(
    "/workflows/{workflow_id}/runs/{run_id}",
    response_model=WorkflowRunDetailResponse,
)
def get_workflow_run(
    workflow_id: int,
    run_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> WorkflowRunDetailResponse:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        run_row = conn.execute(
            """
            SELECT
                runs.id,
                (
                    SELECT COUNT(*)
                    FROM workflow_runs AS numbered_runs
                    WHERE numbered_runs.workflow_id = runs.workflow_id
                      AND numbered_runs.user_id = runs.user_id
                      AND (
                          numbered_runs.created_at < runs.created_at
                          OR (
                              numbered_runs.created_at = runs.created_at
                              AND numbered_runs.id <= runs.id
                          )
                      )
                ) AS display_number,
                runs.workflow_id,
                runs.input_text,
                runs.final_output,
                runs.status,
                runs.error_message,
                runs.duration_ms,
                runs.input_tokens,
                runs.output_tokens,
                runs.total_tokens,
                runs.model_name,
                runs.model_calls,
                runs.created_at,
                runs.completed_at
            FROM workflow_runs AS runs
            WHERE runs.id = ?
              AND runs.workflow_id = ?
              AND runs.user_id = ?
            """,
            (
                run_id,
                workflow_id,
                user["id"],
            ),
        ).fetchone()

        if run_row is None:
            raise HTTPException(
                status_code=404,
                detail="Workflow history not found.",
            )

        step_rows = conn.execute(
            """
            SELECT
                id,
                agent_id,
                agent_name,
                agent_role,
                agent_description,
                agent_order,
                status,
                input_text,
                output,
                error_message,
                started_at,
                completed_at,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                model_name,
                retry_count,
                response_id,
                created_at
            FROM workflow_run_steps
            WHERE run_id = ?
            ORDER BY
                agent_order ASC,
                id ASC
            """,
            (run_id,),
        ).fetchall()

    return WorkflowRunDetailResponse(
        id=run_row[0],
        display_number=run_row[1],
        workflow_id=run_row[2],
        input=run_row[3],
        final_output=run_row[4] or "",
        status=run_row[5],
        error=run_row[6] or "",
        duration_ms=run_row[7],
        input_tokens=run_row[8] or 0,
        output_tokens=run_row[9] or 0,
        total_tokens=run_row[10] or 0,
        model_name=run_row[11] or "",
        model_calls=run_row[12] or 0,
        created_at=run_row[13],
        completed_at=run_row[14],
        agents=[
            WorkflowRunStepItem(
                id=row[0],
                agent_id=row[1],
                name=row[2],
                role=row[3] or "",
                description=row[4] or "",
                order=row[5],
                status=row[6],
                input=row[7] or "",
                output=format_plain_text(
                    row[8] or ""
                ),
                error=row[9] or "",
                started_at=row[10],
                completed_at=row[11],
                duration_ms=row[12],
                input_tokens=row[13] or 0,
                output_tokens=row[14] or 0,
                total_tokens=row[15] or 0,
                model_name=row[16] or "",
                retry_count=row[17] or 0,
                response_id=row[18] or "",
                created_at=row[19],
            )
            for row in step_rows
        ],
        artifacts=load_run_artifacts(
            run_id=run_id,
            workflow_id=workflow_id,
            user_id=user["id"],
        ),
    )


@router.get(
    "/workflows/{workflow_id}/metrics",
    response_model=WorkflowMetricsResponse,
)
def get_workflow_metrics(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> WorkflowMetricsResponse:
    user = require_current_user(
        agentdemo_session,
    )

    _load_workflow(
        workflow_id,
        user["id"],
    )

    with get_connection() as conn:
        run_rows = conn.execute(
            """
            SELECT
                id,
                status,
                duration_ms,
                input_tokens,
                output_tokens,
                total_tokens,
                created_at
            FROM workflow_runs
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY
                created_at ASC,
                id ASC
            """,
            (
                workflow_id,
                user["id"],
            ),
        ).fetchall()

        step_rows = conn.execute(
            """
            SELECT
                steps.agent_id,
                steps.agent_name,
                steps.agent_order,
                steps.status,
                steps.duration_ms,
                steps.input_tokens,
                steps.output_tokens,
                steps.total_tokens,
                runs.duration_ms
            FROM workflow_run_steps AS steps
            INNER JOIN workflow_runs AS runs
                ON runs.id = steps.run_id
            WHERE runs.workflow_id = ?
              AND runs.user_id = ?
            ORDER BY
                steps.agent_order ASC,
                steps.agent_name ASC,
                steps.id ASC
            """,
            (
                workflow_id,
                user["id"],
            ),
        ).fetchall()

    total_runs = len(run_rows)

    completed_runs = sum(
        1
        for row in run_rows
        if row[1] == "completed"
    )

    failed_runs = sum(
        1
        for row in run_rows
        if row[1] == "failed"
    )

    running_runs = sum(
        1
        for row in run_rows
        if row[1] == "running"
    )

    completed_run_rows = [
        row
        for row in run_rows
        if (
            row[1] == "completed"
            and row[2] is not None
        )
    ]

    workflow_durations = [
        float(row[2])
        for row in completed_run_rows
    ]

    workflow_input_tokens = [
        int(row[3] or 0)
        for row in completed_run_rows
    ]

    workflow_output_tokens = [
        int(row[4] or 0)
        for row in completed_run_rows
    ]

    workflow_total_tokens = [
        int(row[5] or 0)
        for row in completed_run_rows
    ]

    workflow_summary = WorkflowMetricsSummary(
        total_runs=total_runs,
        completed_runs=completed_runs,
        failed_runs=failed_runs,
        running_runs=running_runs,
        fastest_duration_ms=(
            int(min(workflow_durations))
            if workflow_durations
            else None
        ),
        average_duration_ms=_round_optional(
            _average(
                workflow_durations,
            )
        ),
        median_duration_ms=_round_optional(
            _median(
                workflow_durations,
            )
        ),
        p95_duration_ms=_round_optional(
            _percentile(
                workflow_durations,
                0.95,
            )
        ),
        slowest_duration_ms=(
            int(max(workflow_durations))
            if workflow_durations
            else None
        ),
        duration_stddev_ms=_round_optional(
            _population_stddev(
                workflow_durations,
            )
        ),
        average_input_tokens=(
            _safe_average_int(
                workflow_input_tokens,
            )
        ),
        average_output_tokens=(
            _safe_average_int(
                workflow_output_tokens,
            )
        ),
        average_total_tokens=(
            _safe_average_int(
                workflow_total_tokens,
            )
        ),
        minimum_total_tokens=(
            min(workflow_total_tokens)
            if workflow_total_tokens
            else 0
        ),
        maximum_total_tokens=(
            max(workflow_total_tokens)
            if workflow_total_tokens
            else 0
        ),
    )

    duration_trend = [
        WorkflowMetricsTrendItem(
            run_id=int(row[0]),
            status=str(row[1]),
            duration_ms=(
                int(row[2])
                if row[2] is not None
                else None
            ),
            input_tokens=int(
                row[3] or 0
            ),
            output_tokens=int(
                row[4] or 0
            ),
            total_tokens=int(
                row[5] or 0
            ),
            created_at=str(row[6]),
        )
        for row in run_rows
    ]

    agent_groups: dict[
        tuple[int | None, str, int],
        list[tuple],
    ] = defaultdict(list)

    for row in step_rows:
        key = (
            (
                int(row[0])
                if row[0] is not None
                else None
            ),
            str(row[1]),
            int(row[2]),
        )

        agent_groups[key].append(
            row
        )

    agent_metrics: list[
        AgentMetricsItem
    ] = []

    for (
        agent_id,
        agent_name,
        agent_order,
    ), rows in agent_groups.items():
        completed_rows = [
            row
            for row in rows
            if (
                row[3] == "completed"
                and row[4] is not None
            )
        ]

        durations = [
            float(row[4])
            for row in completed_rows
        ]

        input_tokens = [
            int(row[5] or 0)
            for row in completed_rows
        ]

        output_tokens = [
            int(row[6] or 0)
            for row in completed_rows
        ]

        total_tokens = [
            int(row[7] or 0)
            for row in completed_rows
        ]

        duration_percentages = [
            (
                float(row[4]) /
                float(row[8])
            ) * 100
            for row in completed_rows
            if (
                row[8] is not None
                and float(row[8]) > 0
            )
        ]

        agent_metrics.append(
            AgentMetricsItem(
                agent_id=agent_id,
                agent_name=agent_name,
                agent_order=agent_order,
                run_count=len(rows),
                completed_count=sum(
                    1
                    for row in rows
                    if row[3] == "completed"
                ),
                failed_count=sum(
                    1
                    for row in rows
                    if row[3] == "failed"
                ),
                fastest_duration_ms=(
                    int(min(durations))
                    if durations
                    else None
                ),
                average_duration_ms=(
                    _round_optional(
                        _average(
                            durations,
                        )
                    )
                ),
                median_duration_ms=(
                    _round_optional(
                        _median(
                            durations,
                        )
                    )
                ),
                p95_duration_ms=(
                    _round_optional(
                        _percentile(
                            durations,
                            0.95,
                        )
                    )
                ),
                slowest_duration_ms=(
                    int(max(durations))
                    if durations
                    else None
                ),
                duration_stddev_ms=(
                    _round_optional(
                        _population_stddev(
                            durations,
                        )
                    )
                ),
                average_input_tokens=(
                    _safe_average_int(
                        input_tokens,
                    )
                ),
                average_output_tokens=(
                    _safe_average_int(
                        output_tokens,
                    )
                ),
                average_total_tokens=(
                    _safe_average_int(
                        total_tokens,
                    )
                ),
                minimum_total_tokens=(
                    min(total_tokens)
                    if total_tokens
                    else 0
                ),
                maximum_total_tokens=(
                    max(total_tokens)
                    if total_tokens
                    else 0
                ),
                average_duration_percentage=round(
                    (
                        sum(
                            duration_percentages
                        ) /
                        len(
                            duration_percentages
                        )
                    )
                    if duration_percentages
                    else 0,
                    2,
                ),
            )
        )

    agent_metrics.sort(
        key=lambda item: (
            item.agent_order,
            item.agent_name,
        )
    )

    return WorkflowMetricsResponse(
        workflow_id=workflow_id,
        workflow=workflow_summary,
        duration_trend=duration_trend,
        agents=agent_metrics,
    )


@router.delete(
    "/workflows/{workflow_id}/runs/{run_id}",
    status_code=204,
)
def delete_workflow_run(
    workflow_id: int,
    run_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> None:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id
            FROM workflow_runs
            WHERE id = ?
              AND workflow_id = ?
              AND user_id = ?
            """,
            (
                run_id,
                workflow_id,
                user["id"],
            ),
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Workflow history not found.",
            )

        conn.execute(
            """
            DELETE FROM workflow_runs
            WHERE id = ?
              AND workflow_id = ?
              AND user_id = ?
            """,
            (
                run_id,
                workflow_id,
                user["id"],
            ),
        )

        conn.commit()


@router.delete(
    "/workflows/{workflow_id}/runs",
    status_code=204,
)
def clear_workflow_runs(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> None:
    user = require_current_user(
        agentdemo_session,
    )

    _load_workflow(
        workflow_id,
        user["id"],
    )

    with get_connection() as conn:
        conn.execute(
            """
            DELETE FROM workflow_runs
            WHERE workflow_id = ?
              AND user_id = ?
            """,
            (
                workflow_id,
                user["id"],
            ),
        )

        conn.commit()