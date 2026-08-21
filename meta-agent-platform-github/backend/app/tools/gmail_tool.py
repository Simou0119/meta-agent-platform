from __future__ import annotations

import base64
import json
import re
from datetime import datetime
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parseaddr
from html.parser import HTMLParser
from typing import Any
from urllib.parse import unquote, urlparse

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



class GmailToolError(RuntimeError):
    """Unified exception raised by Gmail tool operations."""


class _ReadableHTMLParser(HTMLParser):
    """Convert an HTML email body into readable plain text."""

    _BLOCK_TAGS = {
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "div",
        "dl",
        "dt",
        "dd",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "tr",
        "ul",
    }

    _IGNORED_TAGS = {
        "head",
        "script",
        "style",
        "svg",
        "template",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        normalized = tag.lower()

        if normalized in self._IGNORED_TAGS:
            self._ignored_depth += 1
            return

        if self._ignored_depth:
            return

        if normalized == "li":
            self._parts.append("\n• ")
        elif normalized in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()

        if normalized in self._IGNORED_TAGS:
            self._ignored_depth = max(0, self._ignored_depth - 1)
            return

        if self._ignored_depth:
            return

        if normalized in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self._parts.append(data)

    def get_text(self) -> str:
        text = "".join(self._parts)
        text = text.replace("\xa0", " ")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


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
        raise GmailToolError("Google account is not connected.")

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
        raise GmailToolError("Google connection is not active.")

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
            raise GmailToolError(
                "Google access token has expired and no refresh token "
                "is available. Please reconnect Google."
            )

        try:
            credentials.refresh(_build_google_refresh_request())
        except Exception as exc:
            raise GmailToolError(
                "Unable to refresh Google access token. "
                "Please reconnect Google."
            ) from exc

        _save_refreshed_credentials(
            connection_id=connection["id"],
            credentials=credentials,
        )

    return credentials


def _build_gmail_service(
    connection: dict[str, Any],
):
    credentials = _build_google_credentials(connection=connection)

    try:
        return build(
            "gmail",
            "v1",
            http=_build_google_authorized_http(credentials),
            cache_discovery=False,
        )
    except Exception as exc:
        raise GmailToolError(
            "Gmail service could not be initialized."
        ) from exc


def _encode_email_message(
    to: str,
    subject: str,
    body: str,
) -> str:
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    return base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("utf-8")


def create_gmail_draft(
    user_id: int,
    to: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    cleaned_to = to.strip()
    cleaned_subject = subject.strip()
    cleaned_body = body.strip()

    if not cleaned_to:
        raise GmailToolError("Draft recipient is required.")

    if not cleaned_subject:
        raise GmailToolError("Draft subject is required.")

    if not cleaned_body:
        raise GmailToolError("Draft body is required.")

    connection = _load_google_connection(user_id=user_id)
    raw_message = _encode_email_message(
        to=cleaned_to,
        subject=cleaned_subject,
        body=cleaned_body,
    )

    try:
        gmail_service = _build_gmail_service(connection)
        result = (
            gmail_service.users()
            .drafts()
            .create(
                userId="me",
                body={"message": {"raw": raw_message}},
            )
            .execute()
        )
    except HttpError as exc:
        error_content = ""

        if exc.content:
            try:
                error_content = exc.content.decode(
                    "utf-8",
                    errors="replace",
                )
            except AttributeError:
                error_content = str(exc.content)

        raise GmailToolError(
            "Gmail API failed to create the draft. "
            f"{error_content}"
        ) from exc
    except GmailToolError:
        raise
    except Exception as exc:
        raise GmailToolError(
            "Unexpected error while creating Gmail draft."
        ) from exc

    return {
        "success": True,
        "provider": "gmail",
        "action": "create_draft",
        "draft_id": result.get("id"),
        "message_id": result.get("message", {}).get("id"),
        "account_email": connection["account_email"],
        "to": cleaned_to,
        "subject": cleaned_subject,
    }



def _encode_reply_message(
    *,
    to: str,
    subject: str,
    body: str,
    message_header_id: str,
    references: str,
) -> str:
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject

    if message_header_id:
        message["In-Reply-To"] = message_header_id

        reference_items = [
            item
            for item in references.split()
            if item
        ]

        if message_header_id not in reference_items:
            reference_items.append(message_header_id)

        message["References"] = " ".join(reference_items)

    message.set_content(body)

    return base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("utf-8")


def send_gmail_reply(
    *,
    user_id: int,
    original_message: dict[str, Any],
    body: str,
) -> dict[str, Any]:
    """
    Send a direct reply to a normalized Gmail message.

    The reply uses the original thread ID, Subject, In-Reply-To and
    References headers so Gmail can place it in the original conversation.
    """

    cleaned_body = body.strip()

    if not cleaned_body:
        raise GmailToolError("Reply body is required.")

    thread_id = str(
        original_message.get("thread_id")
        or original_message.get("threadId")
        or ""
    ).strip()

    if not thread_id:
        raise GmailToolError(
            "The original Gmail message does not contain a thread ID."
        )

    reply_target_header = str(
        original_message.get("reply_to")
        or original_message.get("from")
        or ""
    ).strip()
    _, reply_target = parseaddr(reply_target_header)
    reply_target = reply_target.strip()

    if not reply_target:
        raise GmailToolError(
            "The original Gmail message does not contain a valid reply address."
        )

    subject = str(
        original_message.get("subject")
        or ""
    ).strip()

    if not subject:
        raise GmailToolError(
            "The original Gmail message does not contain a subject."
        )

    message_header_id = str(
        original_message.get("message_header_id")
        or ""
    ).strip()

    if not message_header_id:
        raise GmailToolError(
            "The original Gmail message does not contain a Message-ID header."
        )

    references = str(
        original_message.get("references")
        or ""
    ).strip()

    connection = _load_google_connection(user_id=user_id)
    raw_message = _encode_reply_message(
        to=reply_target,
        subject=subject,
        body=cleaned_body,
        message_header_id=message_header_id,
        references=references,
    )

    try:
        gmail_service = _build_gmail_service(connection)
        result = (
            gmail_service.users()
            .messages()
            .send(
                userId="me",
                body={
                    "raw": raw_message,
                    "threadId": thread_id,
                },
            )
            .execute()
        )
    except HttpError as exc:
        status_code = getattr(exc.resp, "status", None)

        if status_code == 403:
            message = (
                "Gmail does not allow replies to be sent. "
                "Reconnect Google and grant Gmail compose or send access."
            )
        elif status_code == 400:
            message = (
                "Gmail rejected the reply. The original thread headers "
                "may be incomplete or invalid."
            )
        else:
            message = "Gmail API failed to send the reply."

        raise GmailToolError(message) from exc
    except GmailToolError:
        raise
    except Exception as exc:
        raise GmailToolError(
            "Unexpected error while sending the Gmail reply."
        ) from exc

    return {
        "success": True,
        "provider": "gmail",
        "action": "send_reply",
        "message_id": str(result.get("id") or ""),
        "thread_id": str(result.get("threadId") or thread_id),
        "account_email": connection["account_email"],
        "to": reply_target,
        "subject": subject,
    }

def _decode_base64url_bytes(value: str) -> bytes:
    if not value:
        return b""

    padding = "=" * (-len(value) % 4)

    try:
        return base64.urlsafe_b64decode(value + padding)
    except Exception:
        return b""


def _decode_header_text(value: str) -> str:
    if not value:
        return ""

    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:
        return value.strip()


def _headers_to_dict(payload: dict[str, Any]) -> dict[str, str]:
    headers: dict[str, str] = {}

    for header in payload.get("headers") or []:
        if not isinstance(header, dict):
            continue

        name = str(header.get("name") or "").strip().lower()
        value = _decode_header_text(str(header.get("value") or ""))

        if name:
            headers[name] = value

    return headers


def _extract_charset(payload: dict[str, Any]) -> str:
    headers = _headers_to_dict(payload)
    content_type = headers.get("content-type", "")
    match = re.search(
        r"charset\s*=\s*[\"']?([^;\"'\s]+)",
        content_type,
        flags=re.IGNORECASE,
    )

    return match.group(1).strip() if match else ""


def _decode_message_text(
    data: str,
    payload: dict[str, Any],
) -> str:
    raw = _decode_base64url_bytes(data)

    if not raw:
        return ""

    encodings = [
        _extract_charset(payload),
        "utf-8",
        "utf-16",
        "latin-1",
    ]

    for encoding in encodings:
        if not encoding:
            continue

        try:
            return raw.decode(encoding).strip()
        except (LookupError, UnicodeDecodeError):
            continue

    return raw.decode("utf-8", errors="replace").strip()


def _html_to_plain_text(value: str) -> str:
    if not value:
        return ""

    parser = _ReadableHTMLParser()

    try:
        parser.feed(value)
        parser.close()
    except Exception:
        return re.sub(r"<[^>]+>", " ", value).strip()

    return parser.get_text()


def _part_is_attachment(payload: dict[str, Any]) -> bool:
    filename = str(payload.get("filename") or "").strip()
    body = payload.get("body") or {}
    headers = _headers_to_dict(payload)
    disposition = headers.get("content-disposition", "").lower()

    return bool(
        filename
        or body.get("attachmentId")
        or disposition.startswith("attachment")
    )


def _collect_message_parts(
    payload: dict[str, Any],
    *,
    plain_parts: list[str],
    html_parts: list[str],
    attachments: list[dict[str, Any]],
) -> None:
    mime_type = str(payload.get("mimeType") or "").lower()
    filename = _decode_header_text(
        str(payload.get("filename") or "")
    )
    part_id = str(payload.get("partId") or "")
    body = payload.get("body") or {}
    attachment_id = str(body.get("attachmentId") or "")
    size_bytes = int(body.get("size") or 0)
    is_attachment = _part_is_attachment(payload)

    if is_attachment:
        attachments.append(
            {
                "filename": filename or "Unnamed attachment",
                "mime_type": mime_type or "application/octet-stream",
                "size_bytes": size_bytes,
                "attachment_id": attachment_id,
                "part_id": part_id,
            }
        )
    else:
        data = str(body.get("data") or "")

        if mime_type == "text/plain" and data:
            text = _decode_message_text(data, payload)
            if text:
                plain_parts.append(text)
        elif mime_type == "text/html" and data:
            html = _decode_message_text(data, payload)
            text = _html_to_plain_text(html)
            if text:
                html_parts.append(text)

    for child in payload.get("parts") or []:
        if isinstance(child, dict):
            _collect_message_parts(
                child,
                plain_parts=plain_parts,
                html_parts=html_parts,
                attachments=attachments,
            )


def _deduplicate_text_parts(parts: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for part in parts:
        normalized = re.sub(r"\s+", " ", part).strip()

        if not normalized or normalized in seen:
            continue

        seen.add(normalized)
        result.append(part.strip())

    return result


def _read_gmail_message_with_service(
    *,
    gmail_service: Any,
    connection: dict[str, Any],
    message_id: str,
) -> dict[str, Any]:
    cleaned_message_id = message_id.strip()

    if not cleaned_message_id:
        raise GmailToolError("Gmail message ID is required.")

    detail = (
        gmail_service.users()
        .messages()
        .get(
            userId="me",
            id=cleaned_message_id,
            format="full",
        )
        .execute()
    )

    payload = detail.get("payload") or {}
    headers = _headers_to_dict(payload)
    plain_parts: list[str] = []
    html_parts: list[str] = []
    attachments: list[dict[str, Any]] = []

    _collect_message_parts(
        payload,
        plain_parts=plain_parts,
        html_parts=html_parts,
        attachments=attachments,
    )

    plain_parts = _deduplicate_text_parts(plain_parts)
    html_parts = _deduplicate_text_parts(html_parts)

    body = "\n\n".join(plain_parts).strip()
    body_source = "text/plain"

    if not body:
        body = "\n\n".join(html_parts).strip()
        body_source = "text/html" if body else "snippet"

    if not body:
        body = str(detail.get("snippet") or "").strip()

    internal_date_ms = int(detail.get("internalDate") or 0)

    return {
        "success": True,
        "provider": "gmail",
        "action": "read_message",
        "id": cleaned_message_id,
        "message_id": cleaned_message_id,
        "thread_id": str(detail.get("threadId") or ""),
        "history_id": str(detail.get("historyId") or ""),
        "internal_date_ms": internal_date_ms,
        "label_ids": [
            str(value)
            for value in detail.get("labelIds") or []
        ],
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "cc": headers.get("cc", ""),
        "bcc": headers.get("bcc", ""),
        "reply_to": headers.get("reply-to", ""),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "message_header_id": headers.get("message-id", ""),
        "in_reply_to": headers.get("in-reply-to", ""),
        "references": headers.get("references", ""),
        "body": body,
        "body_source": body_source,
        "snippet": str(detail.get("snippet") or ""),
        "attachments": attachments,
        "has_attachment": bool(attachments),
        "account_email": connection["account_email"],
    }


def read_gmail_message(
    user_id: int,
    message_id: str,
) -> dict[str, Any]:
    """Read one Gmail message and return normalized headers, body and files."""

    connection = _load_google_connection(user_id=user_id)

    try:
        gmail_service = _build_gmail_service(connection)
        return _read_gmail_message_with_service(
            gmail_service=gmail_service,
            connection=connection,
            message_id=message_id,
        )
    except HttpError as exc:
        status_code = getattr(exc.resp, "status", None)

        if status_code == 404:
            message = "Gmail message was not found."
        elif status_code == 403:
            message = (
                "Gmail does not allow this message to be read. "
                "Reconnect Google and grant Gmail read access."
            )
        else:
            message = (
                "Gmail API failed to read the message. "
                "Please reconnect Google and grant Gmail read access."
            )

        raise GmailToolError(message) from exc
    except GmailToolError:
        raise
    except Exception as exc:
        raise GmailToolError(
            "Unexpected error while reading the Gmail message."
        ) from exc


def _escape_gmail_search_text(value: str) -> str:
    """Escape text embedded inside a quoted Gmail search expression."""

    return value.replace("\\", "\\\\").replace('"', '\\"')


def search_gmail_message_by_subject(
    user_id: int,
    subject: str,
    max_results: int = 20,
) -> dict[str, Any]:
    """
    Find and read the newest Gmail message matching a subject.

    Exact subject matches are preferred. If Gmail returns only partial
    matches, the newest message whose subject contains the requested text is
    used. Spam and Trash are excluded.
    """

    cleaned_subject = re.sub(r"\s+", " ", subject).strip()

    if not cleaned_subject:
        raise GmailToolError("Gmail subject is required.")

    connection = _load_google_connection(user_id=user_id)
    bounded_max = max(1, min(int(max_results), 50))
    escaped_subject = _escape_gmail_search_text(cleaned_subject)
    query = (
        'in:anywhere -in:spam -in:trash '
        f'subject:"{escaped_subject}"'
    )

    try:
        gmail_service = _build_gmail_service(connection)
        listed = (
            gmail_service.users()
            .messages()
            .list(
                userId="me",
                q=query,
                maxResults=bounded_max,
            )
            .execute()
        )

        messages: list[dict[str, Any]] = []

        for item in listed.get("messages", []):
            message_id = str(item.get("id") or "").strip()

            if not message_id:
                continue

            messages.append(
                _read_gmail_message_with_service(
                    gmail_service=gmail_service,
                    connection=connection,
                    message_id=message_id,
                )
            )

        messages.sort(
            key=lambda item: int(item.get("internal_date_ms") or 0),
            reverse=True,
        )

        normalized_requested = cleaned_subject.casefold()
        exact_matches = [
            message
            for message in messages
            if re.sub(
                r"\s+",
                " ",
                str(message.get("subject") or ""),
            ).strip().casefold()
            == normalized_requested
        ]

        if exact_matches:
            return exact_matches[0]

        partial_matches = [
            message
            for message in messages
            if normalized_requested
            in re.sub(
                r"\s+",
                " ",
                str(message.get("subject") or ""),
            ).strip().casefold()
        ]

        if partial_matches:
            return partial_matches[0]

        raise GmailToolError(
            "No Gmail message was found with a subject matching "
            f'"{cleaned_subject}".'
        )

    except HttpError as exc:
        status_code = getattr(exc.resp, "status", None)

        if status_code == 403:
            error_message = (
                "Gmail does not allow messages to be searched. "
                "Reconnect Google and grant Gmail read access."
            )
        else:
            error_message = (
                "Gmail API failed to search messages by subject. "
                "Please reconnect Google and grant Gmail read access."
            )

        raise GmailToolError(error_message) from exc
    except GmailToolError:
        raise
    except Exception as exc:
        raise GmailToolError(
            "Unexpected error while searching Gmail messages by subject."
        ) from exc


def format_gmail_message_for_workflow(
    message: dict[str, Any],
) -> str:
    """Create a stable, readable Agent input from a normalized Gmail message."""

    attachments = message.get("attachments") or []
    attachment_lines: list[str] = []

    for index, attachment in enumerate(attachments, start=1):
        if not isinstance(attachment, dict):
            continue

        filename = str(
            attachment.get("filename") or "Unnamed attachment"
        )
        mime_type = str(
            attachment.get("mime_type") or "application/octet-stream"
        )
        size_bytes = int(attachment.get("size_bytes") or 0)
        attachment_id = str(attachment.get("attachment_id") or "")

        line = (
            f"{index}. {filename} "
            f"({mime_type}, {size_bytes} bytes)"
        )

        if attachment_id:
            line += f" | Attachment ID: {attachment_id}"

        attachment_lines.append(line)

    attachment_text = (
        "\n".join(attachment_lines)
        if attachment_lines
        else "None"
    )

    body = str(message.get("body") or "").strip()
    if not body:
        body = str(message.get("snippet") or "").strip()
    if not body:
        body = "No readable message body was found."

    return f"""Gmail Message

Message ID: {message.get('message_id') or message.get('id') or ''}
Thread ID: {message.get('thread_id') or ''}
Account: {message.get('account_email') or ''}
From: {message.get('from') or ''}
To: {message.get('to') or ''}
Cc: {message.get('cc') or ''}
Reply-To: {message.get('reply_to') or ''}
Subject: {message.get('subject') or ''}
Date: {message.get('date') or ''}
Body source: {message.get('body_source') or ''}
Has attachment: {'Yes' if message.get('has_attachment') else 'No'}

Attachments:
{attachment_text}

Body:
{body}""".strip()


def list_new_gmail_messages(
    user_id: int,
    after_ms: int,
    max_results: int = 20,
) -> list[dict[str, Any]]:
    """Return normalized Inbox messages received after ``after_ms``."""

    connection = _load_google_connection(user_id=user_id)
    after_seconds = max(0, int(after_ms // 1000))
    bounded_max = max(1, min(int(max_results), 100))

    try:
        gmail_service = _build_gmail_service(connection)
        listed = (
            gmail_service.users()
            .messages()
            .list(
                userId="me",
                labelIds=["INBOX"],
                q=f"after:{after_seconds}",
                maxResults=bounded_max,
            )
            .execute()
        )

        messages: list[dict[str, Any]] = []

        for item in listed.get("messages", []):
            message_id = str(item.get("id") or "").strip()

            if not message_id:
                continue

            message = _read_gmail_message_with_service(
                gmail_service=gmail_service,
                connection=connection,
                message_id=message_id,
            )

            if int(message.get("internal_date_ms") or 0) <= after_ms:
                continue

            messages.append(message)

        messages.sort(
            key=lambda item: int(item.get("internal_date_ms") or 0)
        )
        return messages
    except HttpError as exc:
        raise GmailToolError(
            "Gmail API failed to read new messages. "
            "Please reconnect Google and grant Gmail read access."
        ) from exc
    except GmailToolError:
        raise
    except Exception as exc:
        raise GmailToolError(
            "Unexpected error while reading Gmail messages."
        ) from exc