from __future__ import annotations

import json
import re
from datetime import date, datetime, time, timedelta
from typing import Any
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import google_auth_httplib2
import httplib2
import requests
import socks

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_HTTP_TIMEOUT_SECONDS,
    GOOGLE_PROXY_URL,
)
from ..database import get_connection


GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _normalized_google_proxy_url() -> str:
    """Return a normalized optional Google proxy URL."""

    proxy_url = GOOGLE_PROXY_URL.strip()

    if not proxy_url:
        return ""

    if "://" not in proxy_url:
        proxy_url = f"http://{proxy_url}"

    return proxy_url


def _build_google_proxy_info() -> httplib2.ProxyInfo | None:
    """Build httplib2 proxy settings for Google API requests."""

    proxy_url = _normalized_google_proxy_url()

    if not proxy_url:
        return None

    parsed = urlparse(proxy_url)
    scheme = parsed.scheme.casefold()
    host = parsed.hostname

    if not host:
        raise RuntimeError(
            "GOOGLE_PROXY_URL must contain a valid proxy host."
        )

    if scheme in {"http", "https"}:
        proxy_type = socks.PROXY_TYPE_HTTP
        default_port = 80 if scheme == "http" else 443
        proxy_rdns = True
    elif scheme in {"socks5", "socks5h"}:
        proxy_type = socks.PROXY_TYPE_SOCKS5
        default_port = 1080
        proxy_rdns = scheme == "socks5h"
    elif scheme in {"socks4", "socks4a"}:
        proxy_type = socks.PROXY_TYPE_SOCKS4
        default_port = 1080
        proxy_rdns = scheme == "socks4a"
    else:
        raise RuntimeError(
            "GOOGLE_PROXY_URL must use http, https, socks4, socks4a, "
            "socks5 or socks5h."
        )

    username = (
        unquote(parsed.username)
        if parsed.username
        else None
    )
    password = (
        unquote(parsed.password)
        if parsed.password
        else None
    )

    return httplib2.ProxyInfo(
        proxy_type=proxy_type,
        proxy_host=host,
        proxy_port=parsed.port or default_port,
        proxy_rdns=proxy_rdns,
        proxy_user=username,
        proxy_pass=password,
    )


def _build_google_refresh_request() -> Request:
    """Create the transport used when OAuth credentials need refreshing."""

    proxy_url = _normalized_google_proxy_url()

    if not proxy_url:
        return Request()

    session = requests.Session()

    # Use only the explicitly configured Google proxy for this transport.
    # This avoids depending on a browser-only Windows proxy configuration.
    session.trust_env = False
    session.proxies.update(
        {
            "http": proxy_url,
            "https": proxy_url,
        }
    )

    return Request(session=session)


def _build_google_authorized_http(
    credentials: Credentials,
) -> google_auth_httplib2.AuthorizedHttp:
    """Create an authorized httplib2 client with optional proxy support."""

    http = httplib2.Http(
        proxy_info=_build_google_proxy_info(),
        timeout=GOOGLE_HTTP_TIMEOUT_SECONDS,
    )

    return google_auth_httplib2.AuthorizedHttp(
        credentials,
        http=http,
    )

DEFAULT_CALENDAR_TIMEZONE = "Europe/Berlin"
DEFAULT_CALENDAR_LOOKAHEAD_DAYS = 7
MAX_CALENDAR_RESULTS = 100


class CalendarToolError(RuntimeError):
    """Unified exception raised by Google Calendar tool operations."""


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _load_google_connection(user_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                id,
                account_email,
                access_token,
                refresh_token,
                token_uri,
                scopes_json,
                expires_at,
                status
            FROM integration_connections
            WHERE user_id = ?
              AND provider = 'google'
            """,
            (user_id,),
        ).fetchone()

    if row is None:
        raise CalendarToolError("Google account is not connected.")

    (
        connection_id,
        account_email,
        access_token,
        refresh_token,
        token_uri,
        scopes_json,
        expires_at,
        status,
    ) = row

    if status != "connected":
        raise CalendarToolError("Google connection is not active.")

    try:
        scopes = json.loads(scopes_json or "[]")
    except json.JSONDecodeError:
        scopes = []

    return {
        "id": int(connection_id),
        "account_email": account_email or "",
        "access_token": access_token or "",
        "refresh_token": refresh_token or "",
        "token_uri": token_uri or GOOGLE_TOKEN_URI,
        "scopes": scopes,
        "expires_at": _parse_datetime(expires_at),
    }


def _save_refreshed_credentials(
    connection_id: int,
    credentials: Credentials,
) -> None:
    expiry = (
        credentials.expiry.isoformat()
        if credentials.expiry
        else None
    )

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE integration_connections
            SET
                access_token = ?,
                refresh_token = CASE
                    WHEN ? != ''
                    THEN ?
                    ELSE refresh_token
                END,
                expires_at = ?,
                status = 'connected',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                credentials.token or "",
                credentials.refresh_token or "",
                credentials.refresh_token or "",
                expiry,
                connection_id,
            ),
        )
        conn.commit()


def _build_google_credentials(
    connection: dict[str, Any],
) -> Credentials:
    credentials = Credentials(
        token=connection["access_token"],
        refresh_token=connection["refresh_token"] or None,
        token_uri=connection["token_uri"],
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=connection["scopes"],
    )

    if not credentials.valid:
        if not credentials.refresh_token:
            raise CalendarToolError(
                "Google access token has expired and no refresh token "
                "is available. Please reconnect Google."
            )

        try:
            credentials.refresh(_build_google_refresh_request())
        except Exception as exc:
            raise CalendarToolError(
                "Google access token could not be refreshed. "
                "Please reconnect Google."
            ) from exc

        _save_refreshed_credentials(
            connection_id=connection["id"],
            credentials=credentials,
        )

    return credentials


def _build_calendar_service(
    connection: dict[str, Any],
):
    credentials = _build_google_credentials(connection)

    try:
        return build(
            "calendar",
            "v3",
            http=_build_google_authorized_http(credentials),
            cache_discovery=False,
        )
    except Exception as exc:
        raise CalendarToolError(
            "Google Calendar service could not be initialized."
        ) from exc


def _timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise CalendarToolError(
            f"Unsupported calendar timezone: {value}"
        ) from exc


def _start_of_day(
    value: date,
    timezone_name: str,
) -> datetime:
    tz = _timezone(timezone_name)
    return datetime.combine(value, time.min, tzinfo=tz)


def _extract_prefixed_value(
    text: str,
    patterns: list[str],
) -> str:
    """Read one structured field without crossing into the next line.

    The Calendar action output contains optional fields such as
    ``Calendar attendees:``.  Searching the complete multi-line text with
    patterns that contain ``\s*`` can make the regular expression skip the
    empty value and capture the next line instead.  For example, an empty
    attendee field previously captured ``Original user request:`` and was then
    rejected as an invalid email address.

    Calendar action fields are intentionally one-line fields, so matching each
    physical line separately is both safer and deterministic.
    """

    for line in text.splitlines():
        for pattern in patterns:
            match = re.search(pattern, line)

            if not match:
                continue

            value = match.group(1).strip().strip('"\'')

            if value:
                return value

    return ""


def _parse_iso_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def resolve_calendar_read_request(
    user_message: str,
    *,
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
    now: datetime | None = None,
) -> dict[str, Any]:
    """
    Resolve a manual Calendar Read request into a deterministic date range.

    Supported examples:
    - Read my calendar today
    - Read my calendar tomorrow
    - Read my calendar this week
    - Read my calendar next week
    - Read my calendar for the next 7 days
    - Calendar date: 2026-08-03
    - Calendar from: 2026-08-03
      Calendar to: 2026-08-07
    - Calendar title: Project Meeting

    When no date is supplied, the next seven days are returned.
    """

    tz = _timezone(timezone_name)

    if now is None:
        current = datetime.now(tz)
    elif now.tzinfo is None:
        current = now.replace(tzinfo=tz)
    else:
        current = now.astimezone(tz)

    text = user_message.strip()
    lowered = text.casefold()
    today = current.date()

    title_query = _extract_prefixed_value(
        text,
        [
            r"(?im)^\s*Calendar\s+(?:title|subject|keyword|query)\s*[:：=]\s*(.+?)\s*$",
            r"(?im)^\s*(?:Event|Meeting)\s+(?:title|keyword)\s*[:：=]\s*(.+?)\s*$",
            r"(?im)^\s*(?:日历标题|日程标题|会议标题|日程关键词)\s*[:：=]\s*(.+?)\s*$",
        ],
    )

    calendar_id = _extract_prefixed_value(
        text,
        [
            r"(?im)^\s*Calendar\s+ID\s*[:：=]\s*(.+?)\s*$",
            r"(?im)^\s*日历\s*ID\s*[:：=]\s*(.+?)\s*$",
        ],
    ) or "primary"

    explicit_date_text = _extract_prefixed_value(
        text,
        [
            r"(?im)^\s*Calendar\s+date\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
            r"(?im)^\s*(?:日历日期|日程日期)\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
        ],
    )

    from_text = _extract_prefixed_value(
        text,
        [
            r"(?im)^\s*Calendar\s+from\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
            r"(?im)^\s*(?:日历开始|日程开始)\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
        ],
    )

    to_text = _extract_prefixed_value(
        text,
        [
            r"(?im)^\s*Calendar\s+to\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
            r"(?im)^\s*(?:日历结束|日程结束)\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
        ],
    )

    explicit_date = _parse_iso_date(explicit_date_text)
    from_date = _parse_iso_date(from_text)
    to_date = _parse_iso_date(to_text)

    if explicit_date_text and explicit_date is None:
        raise CalendarToolError(
            "Calendar date must use YYYY-MM-DD."
        )

    if from_text and from_date is None:
        raise CalendarToolError(
            "Calendar from date must use YYYY-MM-DD."
        )

    if to_text and to_date is None:
        raise CalendarToolError(
            "Calendar to date must use YYYY-MM-DD."
        )

    if explicit_date is not None:
        start_date = explicit_date
        end_date = explicit_date + timedelta(days=1)

    elif from_date is not None or to_date is not None:
        start_date = from_date or today
        inclusive_to = to_date or start_date

        if inclusive_to < start_date:
            raise CalendarToolError(
                "Calendar end date cannot be earlier than the start date."
            )

        end_date = inclusive_to + timedelta(days=1)

    elif (
        "tomorrow" in lowered
        or "明天" in text
    ):
        start_date = today + timedelta(days=1)
        end_date = start_date + timedelta(days=1)

    elif (
        "next week" in lowered
        or "下周" in text
    ):
        days_until_next_monday = 7 - today.weekday()
        start_date = today + timedelta(
            days=days_until_next_monday
        )
        end_date = start_date + timedelta(days=7)

    elif (
        "this week" in lowered
        or "本周" in text
        or "这周" in text
    ):
        start_date = today
        end_date = (
            today
            + timedelta(
                days=(7 - today.weekday())
            )
        )

    else:
        next_days_match = re.search(
            r"(?i)(?:next|future)\s+(\d{1,2})\s+days?",
            text,
        )
        chinese_days_match = re.search(
            r"(?:未来|接下来)\s*(\d{1,2})\s*天",
            text,
        )

        if next_days_match or chinese_days_match:
            match = next_days_match or chinese_days_match
            days = max(
                1,
                min(
                    31,
                    int(match.group(1)),
                ),
            )
            start_date = today
            end_date = today + timedelta(days=days)

        elif (
            "today" in lowered
            or "今天" in text
        ):
            start_date = today
            end_date = today + timedelta(days=1)

        else:
            standalone_date_match = re.search(
                r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)",
                text,
            )

            if standalone_date_match:
                parsed = _parse_iso_date(
                    standalone_date_match.group(1)
                )

                if parsed is None:
                    raise CalendarToolError(
                        "Calendar date must use YYYY-MM-DD."
                    )

                start_date = parsed
                end_date = parsed + timedelta(days=1)
            else:
                start_date = today
                end_date = today + timedelta(
                    days=DEFAULT_CALENDAR_LOOKAHEAD_DAYS
                )

    time_min = _start_of_day(
        start_date,
        timezone_name,
    )
    time_max = _start_of_day(
        end_date,
        timezone_name,
    )

    return {
        "calendar_id": calendar_id,
        "timezone": timezone_name,
        "time_min": time_min,
        "time_max": time_max,
        "title_query": title_query,
    }


def _normalize_person(
    person: dict[str, Any] | None,
) -> str:
    if not person:
        return ""

    name = str(
        person.get("displayName")
        or ""
    ).strip()
    email = str(
        person.get("email")
        or ""
    ).strip()

    if name and email:
        return f"{name} <{email}>"

    return email or name


def _normalize_event_time(
    value: dict[str, Any] | None,
) -> dict[str, Any]:
    if not value:
        return {
            "value": "",
            "all_day": False,
            "timezone": "",
        }

    if value.get("dateTime"):
        return {
            "value": str(value.get("dateTime") or ""),
            "all_day": False,
            "timezone": str(value.get("timeZone") or ""),
        }

    return {
        "value": str(value.get("date") or ""),
        "all_day": True,
        "timezone": str(value.get("timeZone") or ""),
    }


def _normalize_event(
    event: dict[str, Any],
) -> dict[str, Any]:
    start = _normalize_event_time(event.get("start"))
    end = _normalize_event_time(event.get("end"))

    attendees = [
        _normalize_person(item)
        for item in event.get("attendees", [])
        if _normalize_person(item)
    ]

    meet_link = str(
        event.get("hangoutLink")
        or ""
    ).strip()

    if not meet_link:
        conference_data = event.get("conferenceData") or {}
        entry_points = conference_data.get("entryPoints") or []

        for entry_point in entry_points:
            uri = str(entry_point.get("uri") or "").strip()

            if uri:
                meet_link = uri
                break

    return {
        "event_id": str(event.get("id") or ""),
        "status": str(event.get("status") or ""),
        "title": str(event.get("summary") or "(No title)"),
        "description": str(event.get("description") or "").strip(),
        "location": str(event.get("location") or "").strip(),
        "start": start["value"],
        "end": end["value"],
        "all_day": bool(start["all_day"]),
        "timezone": start["timezone"] or end["timezone"],
        "organizer": _normalize_person(event.get("organizer")),
        "creator": _normalize_person(event.get("creator")),
        "attendees": attendees,
        "meet_link": meet_link,
        "html_link": str(event.get("htmlLink") or "").strip(),
        "recurring_event_id": str(
            event.get("recurringEventId") or ""
        ).strip(),
    }


def read_calendar_events(
    *,
    user_id: int,
    time_min: datetime,
    time_max: datetime,
    title_query: str = "",
    calendar_id: str = "primary",
    max_results: int = 50,
) -> dict[str, Any]:
    if time_min.tzinfo is None or time_max.tzinfo is None:
        raise CalendarToolError(
            "Calendar time range must include a timezone."
        )

    if time_max <= time_min:
        raise CalendarToolError(
            "Calendar end time must be after the start time."
        )

    connection = _load_google_connection(user_id=user_id)
    calendar_service = _build_calendar_service(connection)

    try:
        response = (
            calendar_service.events()
            .list(
                calendarId=calendar_id,
                timeMin=time_min.isoformat(),
                timeMax=time_max.isoformat(),
                q=title_query or None,
                singleEvents=True,
                orderBy="startTime",
                maxResults=max(
                    1,
                    min(
                        MAX_CALENDAR_RESULTS,
                        int(max_results),
                    ),
                ),
                showDeleted=False,
            )
            .execute()
        )
    except HttpError as exc:
        status_code = getattr(exc.resp, "status", None)

        if status_code == 403:
            message = (
                "Google Calendar read access is unavailable. "
                "Reconnect Google and grant Calendar event read access."
            )
        elif status_code == 404:
            message = (
                "The requested Google Calendar could not be found."
            )
        else:
            message = "Google Calendar API failed to read events."

        raise CalendarToolError(message) from exc
    except Exception as exc:
        raise CalendarToolError(
            "Unexpected error while reading Google Calendar events."
        ) from exc

    events = [
        _normalize_event(item)
        for item in response.get("items", [])
        if str(item.get("status") or "") != "cancelled"
    ]

    return {
        "success": True,
        "provider": "google_calendar",
        "action": "read_events",
        "account_email": connection["account_email"],
        "calendar_id": calendar_id,
        "timezone": str(time_min.tzinfo),
        "time_min": time_min.isoformat(),
        "time_max": time_max.isoformat(),
        "title_query": title_query,
        "event_count": len(events),
        "events": events,
    }


def format_calendar_events_for_workflow(
    result: dict[str, Any],
) -> str:
    events = result.get("events") or []

    lines = [
        "Google Calendar Read Events",
        "",
        f"Google account: {result.get('account_email', '')}",
        f"Calendar ID: {result.get('calendar_id', 'primary')}",
        f"Range start: {result.get('time_min', '')}",
        f"Range end: {result.get('time_max', '')}",
        f"Title query: {result.get('title_query', '') or '(none)'}",
        f"Event count: {len(events)}",
    ]

    if not events:
        lines.extend(
            [
                "",
                "No calendar events were found in this range.",
            ]
        )

        return "\n".join(lines).strip()

    for index, event in enumerate(events, start=1):
        lines.extend(
            [
                "",
                f"Event {index}:",
                f"Title: {event.get('title', '')}",
                f"Start: {event.get('start', '')}",
                f"End: {event.get('end', '')}",
                f"All day: {'Yes' if event.get('all_day') else 'No'}",
                f"Location: {event.get('location', '') or '(none)'}",
                f"Organizer: {event.get('organizer', '') or '(none)'}",
                "Attendees: "
                + (
                    ", ".join(event.get("attendees") or [])
                    or "(none)"
                ),
                f"Google Meet: {event.get('meet_link', '') or '(none)'}",
                f"Description: {event.get('description', '') or '(none)'}",
                f"Event ID: {event.get('event_id', '')}",
                f"Event link: {event.get('html_link', '') or '(none)'}",
            ]
        )

    return "\n".join(lines).strip()


# ------------------------------------------------------------------
# Calendar create / cancel actions
# ------------------------------------------------------------------


def _extract_json_object(text: str) -> dict[str, Any]:
    """Return the first JSON object found in a model/tool instruction block."""

    fenced_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    candidates: list[str] = []

    if fenced_match:
        candidates.append(fenced_match.group(1))

    first_brace = text.find("{")
    last_brace = text.rfind("}")

    if (
        first_brace >= 0
        and last_brace > first_brace
    ):
        candidates.append(
            text[first_brace:last_brace + 1]
        )

    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(value, dict):
            return value

    return {}


def _coerce_bool(
    value: Any,
    *,
    default: bool = False,
) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return default

    normalized = str(value).strip().casefold()

    if normalized in {
        "1",
        "true",
        "yes",
        "y",
        "on",
        "是",
    }:
        return True

    if normalized in {
        "0",
        "false",
        "no",
        "n",
        "off",
        "否",
    }:
        return False

    return default


def _json_value(
    data: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        if key in data:
            value = data[key]

            if value is not None:
                return value

    return None


def _parse_calendar_datetime(
    value: str,
    *,
    timezone_name: str,
) -> datetime:
    normalized = value.strip()

    if not normalized:
        raise CalendarToolError(
            "Calendar date and time are required."
        )

    normalized = normalized.replace("Z", "+00:00")

    parsed: datetime | None = None

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        pass

    if parsed is None:
        formats = [
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y/%m/%d %H:%M",
            "%d.%m.%Y %H:%M",
        ]

        for value_format in formats:
            try:
                parsed = datetime.strptime(
                    normalized,
                    value_format,
                )
                break
            except ValueError:
                continue

    if parsed is None:
        raise CalendarToolError(
            "Calendar date and time must use a format such as "
            "YYYY-MM-DD HH:MM."
        )

    timezone_value = _timezone(timezone_name)

    if parsed.tzinfo is None:
        return parsed.replace(
            tzinfo=timezone_value,
        )

    return parsed.astimezone(
        timezone_value,
    )


def _parse_attendees(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, list):
        raw_values = [
            str(item)
            for item in value
        ]
    else:
        raw_values = re.split(
            r"[,;\n]",
            str(value),
        )

    attendees: list[str] = []
    empty_markers = {
        "",
        "none",
        "no attendees",
        "n/a",
        "null",
        "(none)",
        "<none>",
        "optional",
        "无",
        "没有",
    }

    for raw_value in raw_values:
        email = raw_value.strip()

        if email.casefold() in empty_markers:
            continue

        # Ignore an unfilled template placeholder instead of treating it as
        # a real attendee address.
        if email.startswith("<") and email.endswith(">"):
            continue

        if not re.fullmatch(
            r"[^\s@]+@[^\s@]+\.[^\s@]+",
            email,
        ):
            raise CalendarToolError(
                f"Invalid Calendar attendee email: {email}"
            )

        if email.casefold() not in {
            item.casefold()
            for item in attendees
        }:
            attendees.append(email)

    return attendees


def _line_value(
    text: str,
    patterns: list[str],
) -> str:
    return _extract_prefixed_value(
        text,
        patterns,
    )


def resolve_calendar_create_request(
    text: str,
    *,
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
    default_duration_minutes: int = 60,
) -> dict[str, Any]:
    """
    Parse a Calendar create action from structured Agent output.

    Recommended Agent output:

    Calendar action: create
    Calendar title: Thesis Discussion
    Calendar start: 2026-08-03 15:00
    Calendar end: 2026-08-03 16:00
    Calendar location: University Library
    Calendar description: Discuss thesis progress
    Calendar attendees: person@example.com
    """

    data = _extract_json_object(text)

    action_value = str(
        _json_value(
            data,
            "calendar_action",
            "action",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+action\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历操作\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or "create"
    ).strip().casefold()

    if action_value in {
        "none",
        "skip",
        "do not create",
        "cancel",
        "无",
        "不创建",
    }:
        raise CalendarToolError(
            "The selected Agent did not approve Calendar event creation."
        )

    resolved_timezone = str(
        _json_value(
            data,
            "calendar_timezone",
            "timezone",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+timezone\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历时区\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or timezone_name
    ).strip()

    _timezone(resolved_timezone)

    title = str(
        _json_value(
            data,
            "calendar_title",
            "title",
            "summary",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+(?:title|summary)\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+title\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历标题|日程标题|会议标题)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    start_text = str(
        _json_value(
            data,
            "calendar_start",
            "start",
            "start_datetime",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+start\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+start\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历开始|日程开始|会议开始)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    end_text = str(
        _json_value(
            data,
            "calendar_end",
            "end",
            "end_datetime",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+end\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+end\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历结束|日程结束|会议结束)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    if not title:
        raise CalendarToolError(
            "Calendar Create Event needs a title. The selected Agent "
            "must output 'Calendar title: ...'."
        )

    if not start_text:
        raise CalendarToolError(
            "Calendar Create Event needs a start date and time. The "
            "selected Agent must output 'Calendar start: YYYY-MM-DD HH:MM'."
        )

    start = _parse_calendar_datetime(
        start_text,
        timezone_name=resolved_timezone,
    )

    duration_value = _json_value(
        data,
        "duration_minutes",
        "calendar_duration_minutes",
    )

    if duration_value is None:
        duration_text = _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+duration(?:\s+minutes)?\s*[:：=]\s*(\d+)\s*$",
                r"(?im)^\s*日程时长(?:分钟)?\s*[:：=]\s*(\d+)\s*$",
            ],
        )
        duration_value = duration_text or None

    try:
        duration_minutes = int(
            duration_value
            or default_duration_minutes
        )
    except (TypeError, ValueError) as exc:
        raise CalendarToolError(
            "Calendar duration must be a whole number of minutes."
        ) from exc

    duration_minutes = max(
        1,
        min(
            duration_minutes,
            24 * 60,
        ),
    )

    end = (
        _parse_calendar_datetime(
            end_text,
            timezone_name=resolved_timezone,
        )
        if end_text
        else start + timedelta(
            minutes=duration_minutes,
        )
    )

    if end <= start:
        raise CalendarToolError(
            "Calendar event end time must be after the start time."
        )

    location = str(
        _json_value(
            data,
            "calendar_location",
            "location",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+location\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+location\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历地点|日程地点|会议地点)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    description = str(
        _json_value(
            data,
            "calendar_description",
            "description",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+description\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+description\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历描述|日程描述|会议描述)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    attendees_value = _json_value(
        data,
        "calendar_attendees",
        "attendees",
    )

    if attendees_value is None:
        attendees_value = _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+attendees?\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历参与者|日程参与者|会议参与者)\s*[:：=]\s*(.+?)\s*$",
            ],
        )

    calendar_id = str(
        _json_value(
            data,
            "calendar_id",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+ID\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历\s*ID\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or "primary"
    ).strip()

    return {
        "calendar_id": calendar_id,
        "timezone": resolved_timezone,
        "title": title,
        "start": start,
        "end": end,
        "location": location,
        "description": description,
        "attendees": _parse_attendees(
            attendees_value
        ),
    }


def resolve_calendar_cancel_request(
    text: str,
    *,
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
) -> dict[str, Any]:
    """
    Parse a safe Calendar cancellation request.

    The action accepts either:
    - Calendar event ID: ...
    or
    - Calendar title: ... plus Calendar date/start.
    """

    data = _extract_json_object(text)

    action_value = str(
        _json_value(
            data,
            "calendar_action",
            "action",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+action\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历操作\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or "cancel"
    ).strip().casefold()

    if action_value in {
        "none",
        "skip",
        "do not cancel",
        "create",
        "无",
        "不取消",
    }:
        raise CalendarToolError(
            "The selected Agent did not approve Calendar event cancellation."
        )

    resolved_timezone = str(
        _json_value(
            data,
            "calendar_timezone",
            "timezone",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+timezone\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历时区\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or timezone_name
    ).strip()

    _timezone(resolved_timezone)

    event_id = str(
        _json_value(
            data,
            "calendar_event_id",
            "event_id",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+event\s+ID\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*Event\s+ID\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历事件ID|日程ID|事件ID)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    title = str(
        _json_value(
            data,
            "calendar_title",
            "title",
            "summary",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+(?:title|summary)\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+title\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历标题|日程标题|会议标题)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    start_text = str(
        _json_value(
            data,
            "calendar_start",
            "start",
            "start_datetime",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+start\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:Event|Meeting)\s+start\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*(?:日历开始|日程开始|会议开始)\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or ""
    ).strip()

    date_text = str(
        _json_value(
            data,
            "calendar_date",
            "date",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+date\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
                r"(?im)^\s*(?:日历日期|日程日期|会议日期)\s*[:：=]\s*(\d{4}-\d{2}-\d{2})\s*$",
            ],
        )
        or ""
    ).strip()

    calendar_id = str(
        _json_value(
            data,
            "calendar_id",
        )
        or _line_value(
            text,
            [
                r"(?im)^\s*Calendar\s+ID\s*[:：=]\s*(.+?)\s*$",
                r"(?im)^\s*日历\s*ID\s*[:：=]\s*(.+?)\s*$",
            ],
        )
        or "primary"
    ).strip()

    start = (
        _parse_calendar_datetime(
            start_text,
            timezone_name=resolved_timezone,
        )
        if start_text
        else None
    )

    event_date = (
        _parse_iso_date(date_text)
        if date_text
        else None
    )

    if date_text and event_date is None:
        raise CalendarToolError(
            "Calendar cancellation date must use YYYY-MM-DD."
        )

    if start is not None:
        event_date = start.date()

    if not event_id:
        if not title:
            raise CalendarToolError(
                "Calendar Cancel Event needs either 'Calendar event ID: ...' "
                "or an exact 'Calendar title: ...'."
            )

        if event_date is None:
            raise CalendarToolError(
                "Calendar Cancel Event needs a date when no Event ID is "
                "provided. Output 'Calendar date: YYYY-MM-DD' or "
                "'Calendar start: YYYY-MM-DD HH:MM'."
            )

    return {
        "calendar_id": calendar_id,
        "timezone": resolved_timezone,
        "event_id": event_id,
        "title": title,
        "start": start,
        "date": event_date,
    }


def _event_start_datetime(
    event: dict[str, Any],
    *,
    timezone_name: str,
) -> datetime | None:
    start_value = event.get("start") or {}

    if start_value.get("dateTime"):
        try:
            parsed = datetime.fromisoformat(
                str(start_value["dateTime"]).replace(
                    "Z",
                    "+00:00",
                )
            )
        except ValueError:
            return None

        if parsed.tzinfo is None:
            return parsed.replace(
                tzinfo=_timezone(timezone_name),
            )

        return parsed.astimezone(
            _timezone(timezone_name),
        )

    if start_value.get("date"):
        try:
            parsed_date = date.fromisoformat(
                str(start_value["date"])
            )
        except ValueError:
            return None

        return _start_of_day(
            parsed_date,
            timezone_name,
        )

    return None


def create_calendar_event(
    *,
    user_id: int,
    title: str,
    start: datetime,
    end: datetime,
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
    calendar_id: str = "primary",
    location: str = "",
    description: str = "",
    attendees: list[str] | None = None,
    block_on_conflict: bool = True,
    send_updates: str = "all",
) -> dict[str, Any]:
    if not title.strip():
        raise CalendarToolError(
            "Calendar event title cannot be empty."
        )

    if start.tzinfo is None or end.tzinfo is None:
        raise CalendarToolError(
            "Calendar event start and end must include a timezone."
        )

    if end <= start:
        raise CalendarToolError(
            "Calendar event end time must be after the start time."
        )

    if send_updates not in {
        "all",
        "externalOnly",
        "none",
    }:
        raise CalendarToolError(
            "Unsupported Calendar send_updates value."
        )

    connection = _load_google_connection(
        user_id=user_id,
    )
    calendar_service = _build_calendar_service(
        connection
    )

    conflicts: list[dict[str, Any]] = []

    try:
        conflict_response = (
            calendar_service.events()
            .list(
                calendarId=calendar_id,
                timeMin=start.isoformat(),
                timeMax=end.isoformat(),
                singleEvents=True,
                orderBy="startTime",
                showDeleted=False,
                maxResults=50,
            )
            .execute()
        )

        conflicts = [
            _normalize_event(item)
            for item in conflict_response.get(
                "items",
                [],
            )
            if (
                str(item.get("status") or "")
                != "cancelled"
                and str(
                    item.get("transparency")
                    or "opaque"
                ) != "transparent"
            )
        ]

    except HttpError as exc:
        status_code = getattr(
            exc.resp,
            "status",
            None,
        )

        if status_code == 403:
            raise CalendarToolError(
                "Google Calendar write access is unavailable. Reconnect "
                "Google and grant Calendar event write access."
            ) from exc

        raise CalendarToolError(
            "Google Calendar API could not check event conflicts."
        ) from exc
    except Exception as exc:
        raise CalendarToolError(
            "Unable to connect to Google Calendar while checking event "
            "conflicts. Check the network or GOOGLE_PROXY_URL setting."
        ) from exc

    if block_on_conflict and conflicts:
        conflict_names = ", ".join(
            str(item.get("title") or "(No title)")
            for item in conflicts[:3]
        )

        raise CalendarToolError(
            "Calendar event was not created because the requested time "
            f"overlaps {len(conflicts)} existing event(s): {conflict_names}."
        )

    body: dict[str, Any] = {
        "summary": title.strip(),
        "start": {
            "dateTime": start.isoformat(),
            "timeZone": timezone_name,
        },
        "end": {
            "dateTime": end.isoformat(),
            "timeZone": timezone_name,
        },
    }

    if location.strip():
        body["location"] = location.strip()

    if description.strip():
        body["description"] = description.strip()

    normalized_attendees = attendees or []

    if normalized_attendees:
        body["attendees"] = [
            {
                "email": email,
            }
            for email in normalized_attendees
        ]

    effective_send_updates = (
        send_updates
        if normalized_attendees
        else "none"
    )

    try:
        created_event = (
            calendar_service.events()
            .insert(
                calendarId=calendar_id,
                body=body,
                sendUpdates=(
                    effective_send_updates
                ),
            )
            .execute()
        )
    except HttpError as exc:
        status_code = getattr(
            exc.resp,
            "status",
            None,
        )

        if status_code == 403:
            message = (
                "Google Calendar write access is unavailable. Reconnect "
                "Google and grant Calendar event write access."
            )
        elif status_code == 404:
            message = (
                "The requested Google Calendar could not be found."
            )
        else:
            message = (
                "Google Calendar API failed to create the event."
            )

        raise CalendarToolError(message) from exc
    except Exception as exc:
        raise CalendarToolError(
            "Unable to connect to Google Calendar while creating the event. "
            "Check the network or GOOGLE_PROXY_URL setting."
        ) from exc

    normalized_event = _normalize_event(
        created_event
    )

    return {
        "success": True,
        "provider": "google_calendar",
        "action": "create_event",
        "account_email": connection[
            "account_email"
        ],
        "calendar_id": calendar_id,
        "event_id": normalized_event[
            "event_id"
        ],
        "title": normalized_event[
            "title"
        ],
        "start": normalized_event[
            "start"
        ],
        "end": normalized_event[
            "end"
        ],
        "location": normalized_event[
            "location"
        ],
        "attendees": normalized_event[
            "attendees"
        ],
        "html_link": normalized_event[
            "html_link"
        ],
        "conflict_count": len(conflicts),
    }


def cancel_calendar_event(
    *,
    user_id: int,
    calendar_id: str = "primary",
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
    event_id: str = "",
    title: str = "",
    event_date: date | None = None,
    start: datetime | None = None,
    send_updates: str = "all",
) -> dict[str, Any]:
    if send_updates not in {
        "all",
        "externalOnly",
        "none",
    }:
        raise CalendarToolError(
            "Unsupported Calendar send_updates value."
        )

    connection = _load_google_connection(
        user_id=user_id,
    )
    calendar_service = _build_calendar_service(
        connection
    )

    selected_event: dict[str, Any] | None = None

    try:
        if event_id.strip():
            selected_event = (
                calendar_service.events()
                .get(
                    calendarId=calendar_id,
                    eventId=event_id.strip(),
                )
                .execute()
            )
        else:
            if not title.strip() or event_date is None:
                raise CalendarToolError(
                    "Calendar cancellation needs an Event ID, or an exact "
                    "title and date."
                )

            search_start = _start_of_day(
                event_date,
                timezone_name,
            )
            search_end = search_start + timedelta(
                days=1,
            )

            response = (
                calendar_service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=(
                        search_start.isoformat()
                    ),
                    timeMax=(
                        search_end.isoformat()
                    ),
                    q=title.strip(),
                    singleEvents=True,
                    orderBy="startTime",
                    showDeleted=False,
                    maxResults=100,
                )
                .execute()
            )

            exact_title = title.strip().casefold()
            matches: list[
                dict[str, Any]
            ] = []

            for item in response.get(
                "items",
                [],
            ):
                if (
                    str(item.get("status") or "")
                    == "cancelled"
                ):
                    continue

                item_title = str(
                    item.get("summary")
                    or ""
                ).strip().casefold()

                if item_title != exact_title:
                    continue

                if start is not None:
                    item_start = (
                        _event_start_datetime(
                            item,
                            timezone_name=(
                                timezone_name
                            ),
                        )
                    )

                    if item_start is None:
                        continue

                    difference_seconds = abs(
                        (
                            item_start - start
                        ).total_seconds()
                    )

                    if difference_seconds > 60:
                        continue

                matches.append(item)

            if not matches:
                raise CalendarToolError(
                    "No Google Calendar event matched the exact title and "
                    "date supplied by the selected Agent."
                )

            if len(matches) > 1:
                event_ids = ", ".join(
                    str(item.get("id") or "")
                    for item in matches[:5]
                )

                raise CalendarToolError(
                    "Calendar cancellation was refused because more than "
                    "one event matched. Supply the exact start time or one "
                    f"Calendar event ID. Matching IDs: {event_ids}"
                )

            selected_event = matches[0]

        if selected_event is None:
            raise CalendarToolError(
                "The Calendar event could not be resolved."
            )

        normalized_event = _normalize_event(
            selected_event
        )
        selected_event_id = str(
            selected_event.get("id")
            or event_id
        ).strip()

        if not selected_event_id:
            raise CalendarToolError(
                "The selected Calendar event has no Event ID."
            )

        calendar_service.events().delete(
            calendarId=calendar_id,
            eventId=selected_event_id,
            sendUpdates=send_updates,
        ).execute()

    except CalendarToolError:
        raise
    except HttpError as exc:
        status_code = getattr(
            exc.resp,
            "status",
            None,
        )

        if status_code == 403:
            message = (
                "Google Calendar write access is unavailable. Reconnect "
                "Google and grant Calendar event write access."
            )
        elif status_code == 404:
            message = (
                "The requested Google Calendar event could not be found."
            )
        else:
            message = (
                "Google Calendar API failed to cancel the event."
            )

        raise CalendarToolError(message) from exc
    except Exception as exc:
        raise CalendarToolError(
            "Unable to connect to Google Calendar while cancelling the event. "
            "Check the network or GOOGLE_PROXY_URL setting."
        ) from exc

    return {
        "success": True,
        "provider": "google_calendar",
        "action": "cancel_event",
        "account_email": connection[
            "account_email"
        ],
        "calendar_id": calendar_id,
        "event_id": normalized_event[
            "event_id"
        ],
        "title": normalized_event[
            "title"
        ],
        "start": normalized_event[
            "start"
        ],
        "end": normalized_event[
            "end"
        ],
        "location": normalized_event[
            "location"
        ],
        "attendees": normalized_event[
            "attendees"
        ],
        "html_link": normalized_event[
            "html_link"
        ],
        "cancelled": True,
    }