import json
import time
from fastapi import (
    APIRouter,
    Cookie,
    HTTPException,
)

from ..database import get_connection
from ..deps import require_current_user
from ..schemas import (
    AgentItem,
    AgentListResponse,
    PublishWorkflowRequest,
    PublishWorkflowResponse,
    PublishedAgentItem,
    WorkflowAgentItem,
    WorkflowDetailResponse,
    WorkflowListItem,
    WorkflowListResponse,
    WorkflowTriggerItem,
    WorkflowTriggerListeningRequest,
    WorkflowTriggerListeningResponse,
)


router = APIRouter(
    prefix="/api",
    tags=["workflows"],
)


# ------------------------------------------------------------------
# Legacy agent list
# ------------------------------------------------------------------

@router.get(
    "/agents",
    response_model=AgentListResponse,
)
def list_agents(
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> AgentListResponse:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                name,
                system_prompt,
                created_at
            FROM agents
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()

    return AgentListResponse(
        agents=[
            AgentItem(
                id=row[0],
                name=row[1],
                system_prompt=row[2],
                created_at=row[3],
            )
            for row in rows
        ]
    )


# ------------------------------------------------------------------
# Publish workflow
# ------------------------------------------------------------------

@router.post(
    "/workflows/publish",
    response_model=PublishWorkflowResponse,
)
def publish_workflow(
    request: PublishWorkflowRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> PublishWorkflowResponse:
    user = require_current_user(
        agentdemo_session,
    )

    workflow_name = request.workflow_name.strip()

    if not workflow_name:
        raise HTTPException(
            status_code=400,
            detail="Workflow name cannot be empty.",
        )

    published_agents: list[PublishedAgentItem] = []

    with get_connection() as conn:
        try:
            workflow_cursor = conn.execute(
                """
                INSERT INTO workflows (
                    user_id,
                    name,
                    status,
                    input_configuration_json,
                    output_configuration_json,
                    routing_configuration_json
                )
                VALUES (?, ?, 'published', ?, ?, ?)
                """,
                (
                    user["id"],
                    workflow_name,
                    json.dumps(
                        request.input_capabilities.model_dump(),
                        ensure_ascii=False,
                    ),
                    json.dumps(
                        request.output_capabilities.model_dump(),
                        ensure_ascii=False,
                    ),
                    json.dumps(
                        request.routing.model_dump(),
                        ensure_ascii=False,
                    ),
                ),
            )

            workflow_id = workflow_cursor.lastrowid

            if workflow_id is None:
                raise RuntimeError(
                    "Unable to obtain the new workflow ID."
                )

            agent_count = len(request.agents)
            if request.routing.mode == "conditional":
                for rule in request.routing.rules:
                    if rule.from_agent_order > agent_count or rule.to_agent_order > agent_count:
                        raise HTTPException(status_code=400, detail="Routing rule references an unknown agent order.")
                    if rule.to_agent_order <= rule.from_agent_order:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "Conditional routing currently supports forward-only "
                                "branches. Looping routes are reserved for future work."
                            ),
                        )

            for index, agent in enumerate(
                request.agents
            ):
                agent_name = agent.name.strip()
                system_prompt = (
                    agent.system_prompt.strip()
                )

                if not agent_name:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Every agent must have a name."
                        ),
                    )

                if not system_prompt:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f'Agent "{agent_name}" '
                            "does not have a system prompt."
                        ),
                    )

                agent_order = (
                    agent.order
                    if agent.order >= 1
                    else index + 1
                )

                agent_cursor = conn.execute(
                    """
                    INSERT INTO agents (
                        user_id,
                        workflow_id,
                        name,
                        system_prompt,
                        role,
                        description,
                        agent_order
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        workflow_id,
                        agent_name,
                        system_prompt,
                        agent.role.strip(),
                        agent.description.strip(),
                        agent_order,
                    ),
                )

                agent_id = agent_cursor.lastrowid

                if agent_id is None:
                    raise RuntimeError(
                        "Unable to obtain the new agent ID."
                    )

                published_agents.append(
                    PublishedAgentItem(
                        id=agent_id,
                        name=agent_name,
                    )
                )

            trigger_enabled = (
                0
                if request.trigger.trigger_type == "gmail_new_message"
                else 1
            )

            conn.execute(
                """
                INSERT INTO workflow_triggers (
                    workflow_id,
                    user_id,
                    trigger_type,
                    conditions_json,
                    enabled
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    workflow_id,
                    user["id"],
                    request.trigger.trigger_type,
                    json.dumps(
                        request.trigger.conditions,
                        ensure_ascii=False,
                    ),
                    trigger_enabled,
                ),
            )

            agent_ids_by_order = {
                index + 1: item.id
                for index, item in enumerate(published_agents)
            }

            for tool in request.tools:
                agent_id = agent_ids_by_order.get(
                    tool.agent_order
                )

                if agent_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Tool binding references an unknown "
                            f"agent order: {tool.agent_order}."
                        ),
                    )

                conn.execute(
                    """
                    INSERT INTO agent_tool_bindings (
                        workflow_id,
                        agent_id,
                        user_id,
                        tool_type,
                        permissions_json,
                        configuration_json,
                        enabled
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        workflow_id,
                        agent_id,
                        user["id"],
                        tool.tool_type,
                        json.dumps(
                            tool.permissions,
                            ensure_ascii=False,
                        ),
                        json.dumps(
                            tool.configuration,
                            ensure_ascii=False,
                        ),
                    ),
                )

            conn.commit()

        except HTTPException:
            conn.rollback()
            raise

        except Exception as exc:
            conn.rollback()

            raise HTTPException(
                status_code=500,
                detail="Unable to publish workflow.",
            ) from exc

    return PublishWorkflowResponse(
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        agents=published_agents,
        published=True,
    )


# ------------------------------------------------------------------
# Workflow list
# ------------------------------------------------------------------

@router.get(
    "/workflows",
    response_model=WorkflowListResponse,
)
def list_workflows(
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> WorkflowListResponse:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                w.id,
                w.name,
                w.status,
                COUNT(a.id) AS agent_count,
                w.created_at
            FROM workflows AS w
            LEFT JOIN agents AS a
                ON a.workflow_id = w.id
            WHERE w.user_id = ?
            GROUP BY
                w.id,
                w.name,
                w.status,
                w.created_at
            ORDER BY w.created_at DESC, w.id DESC
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()

    return WorkflowListResponse(
        workflows=[
            WorkflowListItem(
                id=row[0],
                name=row[1],
                status=row[2],
                agent_count=row[3],
                created_at=row[4],
            )
            for row in rows
        ]
    )


# ------------------------------------------------------------------
# Workflow details
# ------------------------------------------------------------------

@router.get(
    "/workflows/{workflow_id}",
    response_model=WorkflowDetailResponse,
)
def get_workflow(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> WorkflowDetailResponse:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        workflow_row = conn.execute(
            """
            SELECT
                id,
                name,
                status,
                created_at,
                updated_at,
                input_configuration_json,
                output_configuration_json,
                routing_configuration_json
            FROM workflows
            WHERE id = ?
              AND user_id = ?
            """,
            (
                workflow_id,
                user["id"],
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
                agent_order,
                created_at
            FROM agents
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY agent_order ASC, id ASC
            """,
            (
                workflow_id,
                user["id"],
            ),
        ).fetchall()

        trigger_row = conn.execute(
            """
            SELECT
                trigger_type,
                conditions_json,
                enabled
            FROM workflow_triggers
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (workflow_id, user["id"]),
        ).fetchone()

    return WorkflowDetailResponse(
        id=workflow_row[0],
        name=workflow_row[1],
        status=workflow_row[2],
        created_at=workflow_row[3],
        updated_at=workflow_row[4],
        agents=[
            WorkflowAgentItem(
                id=row[0],
                name=row[1],
                system_prompt=row[2],
                role=row[3] or "",
                description=row[4] or "",
                order=row[5],
                created_at=row[6],
            )
            for row in agent_rows
        ],
        input_capabilities=(
            json.loads(workflow_row[5] or "{}")
            if workflow_row[5]
            else {}
        ),
        output_capabilities=(
            json.loads(workflow_row[6] or "{}")
            if workflow_row[6]
            else {}
        ),
        routing=(
            json.loads(workflow_row[7] or '{}')
            if workflow_row[7]
            else {"mode": "sequential", "rules": []}
        ),
        trigger=(
            WorkflowTriggerItem(
                trigger_type=str(trigger_row[0]),
                conditions=(
                    json.loads(trigger_row[1] or "{}")
                    if trigger_row is not None
                    else {}
                ),
                listening=bool(trigger_row[2]),
            )
            if trigger_row is not None
            else None
        ),
    )


@router.patch(
    "/workflows/{workflow_id}/trigger/listening",
    response_model=WorkflowTriggerListeningResponse,
)
def set_workflow_trigger_listening(
    workflow_id: int,
    request: WorkflowTriggerListeningRequest,
    agentdemo_session: str | None = Cookie(default=None),
) -> WorkflowTriggerListeningResponse:
    user = require_current_user(agentdemo_session)

    with get_connection() as conn:
        trigger_row = conn.execute(
            """
            SELECT id, trigger_type
            FROM workflow_triggers
            WHERE workflow_id = ?
              AND user_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (workflow_id, user["id"]),
        ).fetchone()

        if trigger_row is None:
            raise HTTPException(404, "Workflow trigger not found.")

        if trigger_row[1] != "gmail_new_message":
            raise HTTPException(400, "This workflow does not use a Gmail trigger.")

        if request.listening:
            connection_row = conn.execute(
                """
                SELECT status
                FROM integration_connections
                WHERE user_id = ?
                  AND provider = 'google'
                """,
                (user["id"],),
            ).fetchone()

            if connection_row is None or connection_row[0] != "connected":
                raise HTTPException(400, "Connect Google before starting Gmail listening.")

            now_ms = int(time.time() * 1000)
            conn.execute(
                """
                INSERT INTO gmail_workflow_polling_state (
                    workflow_id, user_id, last_checked_ms, updated_at
                )
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(workflow_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    last_checked_ms = excluded.last_checked_ms,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (workflow_id, user["id"], now_ms),
            )

        conn.execute(
            """
            UPDATE workflow_triggers
            SET enabled = ?
            WHERE id = ?
              AND user_id = ?
            """,
            (1 if request.listening else 0, trigger_row[0], user["id"]),
        )
        conn.commit()

    return WorkflowTriggerListeningResponse(
        workflow_id=workflow_id,
        trigger_type="gmail_new_message",
        listening=request.listening,
    )


# ------------------------------------------------------------------
# Delete workflow
# ------------------------------------------------------------------

@router.delete(
    "/workflows/{workflow_id}",
    status_code=204,
)
def delete_workflow(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> None:
    user = require_current_user(
        agentdemo_session,
    )

    with get_connection() as conn:
        workflow_row = conn.execute(
            """
            SELECT user_id
            FROM workflows
            WHERE id = ?
            """,
            (workflow_id,),
        ).fetchone()

        if workflow_row is None:
            raise HTTPException(
                status_code=404,
                detail="Workflow not found.",
            )

        if workflow_row[0] != user["id"]:
            raise HTTPException(
                status_code=403,
                detail="Forbidden.",
            )

        try:
            # Explicit deletion also supports databases whose agents
            # table existed before the workflow foreign key was added.
            conn.execute(
                """
                DELETE FROM agents
                WHERE workflow_id = ?
                  AND user_id = ?
                """,
                (
                    workflow_id,
                    user["id"],
                ),
            )

            conn.execute(
                """
                DELETE FROM workflows
                WHERE id = ?
                  AND user_id = ?
                """,
                (
                    workflow_id,
                    user["id"],
                ),
            )

            conn.commit()

        except Exception as exc:
            conn.rollback()

            raise HTTPException(
                status_code=500,
                detail="Unable to delete workflow.",
            ) from exc


# ------------------------------------------------------------------
# Delete individual agent
# ------------------------------------------------------------------

@router.delete(
    "/agents/{agent_id}",
    status_code=204,
)
def delete_agent(
    agent_id: int,
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
            SELECT user_id
            FROM agents
            WHERE id = ?
            """,
            (agent_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Agent not found.",
            )

        if row[0] != user["id"]:
            raise HTTPException(
                status_code=403,
                detail="Forbidden.",
            )

        conn.execute(
            """
            DELETE FROM agents
            WHERE id = ?
            """,
            (agent_id,),
        )

        conn.commit()