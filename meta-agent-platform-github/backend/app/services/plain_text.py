from __future__ import annotations

import ast
import html
import json
import re
from typing import Any


_KEY_LABELS = {
    "summary": "Summary",
    "executive summary": "Executive Summary",
    "key findings": "Key Findings",
    "findings": "Findings",
    "details": "Details",
    "action items": "Action Items",
    "recommended actions": "Recommended Actions",
    "recommendations": "Recommendations",
    "next steps": "Next Steps",
    "open questions": "Open Questions",
    "limitations": "Limitations",
    "open questions or limitations": "Open Questions or Limitations",
    "risks": "Risks",
    "conclusion": "Conclusion",
    "final result": "Final Result",
    "final answer": "Final Answer",
    "subject": "Subject",
    "recipient": "Recipient",
    "email body": "Email Body",
    "process name": "Process Name",
    "process description": "Process Description",
    "process steps": "Process Steps",
    "generated files": "Generated Files",
}


def _normalise_key(value: str) -> str:
    text = str(value).strip()
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()

    mapped = _KEY_LABELS.get(text.lower())
    if mapped:
        return mapped

    return text.title()


def _normalise_heading(match: re.Match[str]) -> str:
    value = match.group(1).strip().rstrip("#").strip()

    if not value:
        return ""

    if value.endswith((":", "：", ".", "!", "?", "！", "？")):
        return value

    return f"{value}:"


def _strip_markdown(content: str) -> str:
    text = html.unescape(str(content))
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove fenced-code markers while preserving the content.
    text = re.sub(
        r"(?m)^\s*```[a-zA-Z0-9_-]*\s*$",
        "",
        text,
    )

    # Images and links.
    text = re.sub(
        r"!\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)",
        lambda match: match.group(1).strip(),
        text,
    )
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: (
            f"{match.group(1).strip()} ({match.group(2).strip()})"
        ),
        text,
    )
    text = re.sub(
        r"<((?:https?://|mailto:)[^>]+)>",
        r"\1",
        text,
    )

    # Headings, quotes and checklists.
    text = re.sub(
        r"(?m)^\s{0,3}#{1,6}\s+(.+?)\s*$",
        _normalise_heading,
        text,
    )
    text = re.sub(r"(?m)^\s*>\s?", "", text)
    text = re.sub(
        r"(?m)^\s*[-+*]\s+\[[ xX]\]\s+",
        "• ",
        text,
    )
    text = re.sub(
        r"(?m)^\s*[-+*]\s+",
        "• ",
        text,
    )

    # Rules and Markdown tables.
    text = re.sub(
        r"(?m)^\s*(?:[-*_]\s*){3,}$",
        "",
        text,
    )
    text = re.sub(
        r"(?m)^\s*\|?\s*:?-{3,}:?\s*"
        r"(?:\|\s*:?-{3,}:?\s*)+\|?\s*$",
        "",
        text,
    )
    text = re.sub(r"(?m)^\s*\|(.+)\|\s*$", r"\1", text)
    text = re.sub(r"[ \t]*\|[ \t]*", "    ", text)

    # Inline Markdown.
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"__(.+?)__", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"~~(.+?)~~", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    text = re.sub(
        r"(?<!\*)\*([^*\n\s](?:[^*\n]*?[^*\n\s])?)\*(?!\*)",
        r"\1",
        text,
    )
    text = re.sub(
        r"(?<!_)_([^_\n\s](?:[^_\n]*?[^_\n\s])?)_(?!_)",
        r"\1",
        text,
    )
    text = re.sub(r"\\([\\`*{}\[\]()#+\-.!_>])", r"\1", text)

    # Whitespace cleanup.
    text = re.sub(r"(?m)[ \t]+$", "", text)
    text = re.sub(r"\n[ \t]+\n", "\n\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def _format_scalar(value: Any) -> str:
    if value is None:
        return "Not provided"

    if isinstance(value, bool):
        return "Yes" if value else "No"

    return _strip_markdown(str(value)).strip()


def _format_json_list(values: list[Any], indent: int = 0) -> list[str]:
    lines: list[str] = []
    prefix = " " * indent

    for index, item in enumerate(values, start=1):
        if isinstance(item, dict):
            lines.append(f"{prefix}{index}.")
            nested = _format_json_dict(item, indent + 3)
            lines.extend(nested)
            continue

        if isinstance(item, list):
            lines.append(f"{prefix}{index}.")
            lines.extend(_format_json_list(item, indent + 3))
            continue

        scalar = _format_scalar(item)
        scalar_lines = scalar.splitlines() or [""]

        lines.append(f"{prefix}{index}. {scalar_lines[0]}")

        for continuation in scalar_lines[1:]:
            lines.append(
                f"{prefix}   {continuation}"
            )

    return lines


def _format_json_dict(
    value: dict[str, Any],
    indent: int = 0,
) -> list[str]:
    lines: list[str] = []
    prefix = " " * indent

    for raw_key, raw_value in value.items():
        label = _normalise_key(str(raw_key))

        if isinstance(raw_value, dict):
            if lines and lines[-1] != "":
                lines.append("")

            lines.append(f"{prefix}{label}:")
            lines.extend(
                _format_json_dict(
                    raw_value,
                    indent + 2,
                )
            )
            continue

        if isinstance(raw_value, list):
            if lines and lines[-1] != "":
                lines.append("")

            lines.append(f"{prefix}{label}:")

            if raw_value:
                lines.extend(
                    _format_json_list(
                        raw_value,
                        indent,
                    )
                )
            else:
                lines.append(f"{prefix}None")

            continue

        scalar = _format_scalar(raw_value)

        if "\n" in scalar or len(scalar) > 100:
            if lines and lines[-1] != "":
                lines.append("")

            lines.append(f"{prefix}{label}:")
            lines.extend(
                f"{prefix}{line}"
                for line in scalar.splitlines()
            )
        else:
            lines.append(
                f"{prefix}{label}: {scalar}"
            )

    return lines


def _format_json_value(value: Any) -> str:
    if isinstance(value, dict):
        lines = _format_json_dict(value)
    elif isinstance(value, list):
        lines = _format_json_list(value)
    else:
        return _format_scalar(value)

    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _try_parse_structured_value(
    candidate: str,
) -> Any | None:
    stripped = candidate.strip()

    if not stripped:
        return None

    # Handle a whole fenced JSON block.
    fenced_match = re.fullmatch(
        r"```(?:json)?\s*(.*?)\s*```",
        stripped,
        flags=re.DOTALL | re.IGNORECASE,
    )

    if fenced_match:
        stripped = fenced_match.group(1).strip()

    try:
        parsed = json.loads(stripped)
    except (json.JSONDecodeError, TypeError):
        parsed = None

    if isinstance(parsed, (dict, list)):
        return parsed

    # Also tolerate Python-style dictionaries returned with single quotes.
    try:
        parsed = ast.literal_eval(stripped)
    except (ValueError, SyntaxError):
        return None

    if isinstance(parsed, (dict, list)):
        return parsed

    return None


def _find_embedded_structured_value(
    text: str,
) -> tuple[str, Any, str] | None:
    """
    Find JSON embedded after a title or explanatory line.

    Example:
        Document Insight Workflow

        {"Summary": "...", "Key Findings": [...]}
    """

    decoder = json.JSONDecoder()

    for index, character in enumerate(text):
        if character not in "{[":
            continue

        try:
            parsed, consumed = decoder.raw_decode(
                text[index:]
            )
        except json.JSONDecodeError:
            continue

        if not isinstance(parsed, (dict, list)):
            continue

        end_index = index + consumed

        return (
            text[:index].strip(),
            parsed,
            text[end_index:].strip(),
        )

    return None


def format_plain_text(content: str | None) -> str:
    """
    Return clean, readable plain text.

    Processing order:
    1. Detect JSON or dictionary output.
    2. Convert structured values into labelled sections and numbered items.
    3. Remove remaining Markdown presentation syntax.

    The function is suitable for chat, workflow history, Gmail drafts,
    DOCX exports and PDF exports.
    """

    if not content:
        return ""

    text = html.unescape(str(content))
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.strip()

    structured = _try_parse_structured_value(text)

    if structured is not None:
        return _format_json_value(structured)

    embedded = _find_embedded_structured_value(text)

    if embedded is not None:
        prefix, structured_value, suffix = embedded
        parts: list[str] = []

        if prefix:
            parts.append(_strip_markdown(prefix))

        parts.append(
            _format_json_value(structured_value)
        )

        if suffix:
            parts.append(_strip_markdown(suffix))

        return "\n\n".join(
            part
            for part in parts
            if part
        ).strip()

    return _strip_markdown(text)