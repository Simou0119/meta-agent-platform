import json
import logging
import threading
import time
from typing import Any

from ..config import GMAIL_TRIGGER_POLL_SECONDS
from ..database import get_connection
from ..tools.gmail_tool import (
    GmailToolError,
    format_gmail_message_for_workflow,
    list_new_gmail_messages,
)

logger = logging.getLogger(__name__)

# Re-scan a short window on every poll. The processed_trigger_events table
# prevents duplicate workflow executions, while this overlap prevents Gmail
# indexing delays or request timing boundaries from causing missed messages.
GMAIL_POLL_OVERLAP_MS = 2 * 60 * 1000
GMAIL_MAX_RESULTS = 100

# If the backend stops after an event is claimed but before it is completed,
# the database row remains in "processing". Allow that event to be claimed
# again after a safe timeout. A normal workflow should finish well before this.
GMAIL_STALE_PROCESSING_MINUTES = 30

_stop_event = threading.Event()
_monitor_thread: threading.Thread | None = None


def _load_enabled_triggers() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                triggers.workflow_id,
                triggers.user_id,
                triggers.conditions_json
            FROM workflow_triggers AS triggers
            INNER JOIN workflows
                ON workflows.id = triggers.workflow_id
            INNER JOIN integration_connections AS connections
                ON connections.user_id = triggers.user_id
               AND connections.provider = 'google'
               AND connections.status = 'connected'
            WHERE triggers.trigger_type = 'gmail_new_message'
              AND triggers.enabled = 1
              AND workflows.status = 'published'
            ORDER BY triggers.user_id, triggers.workflow_id
            """
        ).fetchall()

    result: list[dict[str, Any]] = []

    for row in rows:
        try:
            conditions = json.loads(row[2] or "{}")
        except (json.JSONDecodeError, TypeError):
            conditions = {}

        if not isinstance(conditions, dict):
            conditions = {}

        result.append(
            {
                "workflow_id": int(row[0]),
                "user_id": int(row[1]),
                "conditions": conditions,
            }
        )

    return result


def _get_last_checked_ms(workflow_id: int) -> int | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT last_checked_ms
            FROM gmail_workflow_polling_state
            WHERE workflow_id = ?
            """,
            (workflow_id,),
        ).fetchone()

    return int(row[0]) if row is not None else None


def _set_last_checked_ms(
    workflow_id: int,
    user_id: int,
    value: int,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO gmail_workflow_polling_state (
                workflow_id,
                user_id,
                last_checked_ms,
                updated_at
            )
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(workflow_id) DO UPDATE SET
                user_id = excluded.user_id,
                last_checked_ms = excluded.last_checked_ms,
                updated_at = CURRENT_TIMESTAMP
            """,
            (workflow_id, user_id, value),
        )
        conn.commit()


def _condition_is_true(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    return str(value or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _matches(
    message: dict[str, Any],
    conditions: dict[str, Any],
) -> bool:
    sender_contains = str(
        conditions.get("sender_contains") or ""
    ).strip().lower()
    subject_contains = str(
        conditions.get("subject_contains") or ""
    ).strip().lower()
    require_attachment = _condition_is_true(
        conditions.get("has_attachment")
    )

    if sender_contains and sender_contains not in str(
        message.get("from") or ""
    ).lower():
        return False

    if subject_contains and subject_contains not in str(
        message.get("subject") or ""
    ).lower():
        return False

    if require_attachment and not bool(message.get("has_attachment")):
        return False

    return True


def _claim_event(
    *,
    user_id: int,
    workflow_id: int,
    message_id: str,
) -> bool:
    """
    Claim a Gmail event exactly once.

    A stale "processing" event can be reclaimed after the configured timeout.
    Completed and failed events remain deduplicated. Failed events are not
    retried every 20 seconds, which prevents an invalid workflow from creating
    an endless retry loop and repeated model usage.
    """

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO processed_trigger_events (
                user_id,
                workflow_id,
                provider,
                event_id,
                status
            )
            VALUES (?, ?, 'gmail', ?, 'processing')
            """,
            (user_id, workflow_id, message_id),
        )

        if cursor.rowcount > 0:
            conn.commit()
            return True

        stale_modifier = f"-{GMAIL_STALE_PROCESSING_MINUTES} minutes"
        cursor = conn.execute(
            """
            UPDATE processed_trigger_events
            SET
                user_id = ?,
                status = 'processing',
                error_message = '',
                created_at = CURRENT_TIMESTAMP,
                completed_at = NULL
            WHERE workflow_id = ?
              AND provider = 'gmail'
              AND event_id = ?
              AND status = 'processing'
              AND created_at <= datetime('now', ?)
            """,
            (
                user_id,
                workflow_id,
                message_id,
                stale_modifier,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def _finish_event(
    *,
    workflow_id: int,
    message_id: str,
    status: str,
    error: str = "",
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE processed_trigger_events
            SET
                status = ?,
                error_message = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE workflow_id = ?
              AND provider = 'gmail'
              AND event_id = ?
            """,
            (status, error, workflow_id, message_id),
        )
        conn.commit()


def _build_email_input(message: dict[str, Any]) -> str:
    """Build the original workflow request from a normalized Gmail message."""

    return (
        "New Gmail message received.\n\n"
        f"{format_gmail_message_for_workflow(message)}"
    ).strip()


def _run_triggered_workflow(
    *,
    workflow_id: int,
    user_id: int,
    message: dict[str, Any],
) -> None:
    # Imported lazily to avoid an import cycle during FastAPI startup.
    from ..routers.workflow_runtime import (
        _load_workflow,
        _stream_workflow_run,
    )

    workflow, agents = _load_workflow(workflow_id, user_id)

    for _event in _stream_workflow_run(
        workflow=workflow,
        agents=agents,
        user_message=_build_email_input(message),
        user_id=user_id,
        # This is essential for Gmail Read Message. The runtime uses this
        # normalized object instead of making another API request, and injects
        # the full email only into the agent bound to gmail_read.
        gmail_message=message,
    ):
        pass


def _message_timestamp_ms(message: dict[str, Any]) -> int:
    value = (
        message.get("internal_date_ms")
        or message.get("internalDate")
        or 0
    )

    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def poll_gmail_triggers_once() -> None:
    triggers = _load_enabled_triggers()

    for trigger in triggers:
        workflow_id = int(trigger["workflow_id"])
        user_id = int(trigger["user_id"])
        last_checked_ms = _get_last_checked_ms(workflow_id)

        # A workflow only receives a baseline when the user presses
        # Start Listening. Missing state therefore means it is not ready.
        if last_checked_ms is None:
            continue

        # Gmail can index a newly delivered message slightly later than its
        # actual arrival time. Re-scan a small overlap window and rely on
        # processed_trigger_events for idempotency.
        query_after_ms = max(
            0,
            last_checked_ms - GMAIL_POLL_OVERLAP_MS,
        )
        poll_started_ms = int(time.time() * 1000)

        try:
            messages = list_new_gmail_messages(
                user_id=user_id,
                after_ms=query_after_ms,
                max_results=GMAIL_MAX_RESULTS,
            )

        except GmailToolError as exc:
            logger.exception(
                (
                    "Gmail trigger poll failed. "
                    "workflow_id=%s user_id=%s after_ms=%s error=%s"
                ),
                workflow_id,
                user_id,
                query_after_ms,
                exc,
            )
            continue
        except Exception:
            logger.exception(
                "Unexpected Gmail polling failure for workflow %s",
                workflow_id,
            )
            continue

        logger.info(
            "Gmail poll workflow=%s after_ms=%s returned=%s",
            workflow_id,
            query_after_ms,
            len(messages),
        )

        # Only move the checkpoint after Gmail was queried successfully.
        # The overlap window on the next poll safely covers boundary cases.
        _set_last_checked_ms(
            workflow_id,
            user_id,
            poll_started_ms,
        )

        # Process older messages first when several messages arrive between
        # polling cycles. Unknown/missing timestamps keep their API order.
        messages.sort(key=_message_timestamp_ms)

        for message in messages:
            message_id = str(
                message.get("message_id")
                or message.get("id")
                or ""
            ).strip()

            if not message_id:
                logger.warning(
                    "Skipped Gmail message without an ID for workflow %s",
                    workflow_id,
                )
                continue

            if not _matches(message, trigger["conditions"]):
                continue

            if not _claim_event(
                user_id=user_id,
                workflow_id=workflow_id,
                message_id=message_id,
            ):
                continue

            try:
                _run_triggered_workflow(
                    workflow_id=workflow_id,
                    user_id=user_id,
                    message=message,
                )
            except Exception as exc:
                logger.exception(
                    "Gmail-triggered workflow %s failed",
                    workflow_id,
                )
                _finish_event(
                    workflow_id=workflow_id,
                    message_id=message_id,
                    status="failed",
                    error=str(exc),
                )
            else:
                _finish_event(
                    workflow_id=workflow_id,
                    message_id=message_id,
                    status="completed",
                )


def _monitor_loop() -> None:
    while not _stop_event.is_set():
        try:
            poll_gmail_triggers_once()
        except Exception:
            logger.exception("Unexpected Gmail trigger monitor error")

        _stop_event.wait(GMAIL_TRIGGER_POLL_SECONDS)


def start_gmail_trigger_monitor() -> None:
    global _monitor_thread

    if _monitor_thread and _monitor_thread.is_alive():
        return

    _stop_event.clear()
    _monitor_thread = threading.Thread(
        target=_monitor_loop,
        name="gmail-trigger-monitor",
        daemon=True,
    )
    _monitor_thread.start()


def stop_gmail_trigger_monitor() -> None:
    global _monitor_thread

    _stop_event.set()

    if _monitor_thread and _monitor_thread.is_alive():
        _monitor_thread.join(timeout=5)

    _monitor_thread = None