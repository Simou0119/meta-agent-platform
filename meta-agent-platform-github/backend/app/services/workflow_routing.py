from __future__ import annotations

import json
import re
from typing import Any

_SUPPORTED_OPERATORS = {
    "equals", "not_equals", "contains", "not_contains",
    "greater_than", "greater_or_equal", "less_than", "less_or_equal",
    "truthy", "falsy",
}

def normalize_routing_configuration(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"mode": "sequential", "rules": []}
    mode = str(value.get("mode") or "sequential").strip().lower()
    raw_rules = value.get("rules")
    if mode != "conditional" or not isinstance(raw_rules, list):
        return {"mode": "sequential", "rules": []}
    rules: list[dict[str, Any]] = []
    for raw_rule in raw_rules:
        if not isinstance(raw_rule, dict):
            continue
        condition = raw_rule.get("condition")
        if not isinstance(condition, dict):
            continue
        try:
            from_order = int(raw_rule.get("from_agent_order"))
            to_order = int(raw_rule.get("to_agent_order"))
            priority = int(raw_rule.get("priority") or 100)
        except (TypeError, ValueError):
            continue
        field = str(condition.get("field") or "").strip()
        operator = str(condition.get("operator") or "equals").strip().lower()
        if not field or operator not in _SUPPORTED_OPERATORS or from_order < 1 or to_order <= from_order:
            continue
        rules.append({
            "from_agent_order": from_order,
            "to_agent_order": to_order,
            "condition": {"field": field, "operator": operator, "value": condition.get("value")},
            "label": str(raw_rule.get("label") or "").strip(),
            "priority": priority,
        })
    rules.sort(key=lambda item: (item["from_agent_order"], item["priority"]))
    return {"mode": "conditional" if rules else "sequential", "rules": rules}

def _normalize_key(value: str) -> str:
    return re.sub(r"[\s-]+", "_", value.strip().lower())

def _parse_scalar(value: str) -> Any:
    text = value.strip().strip('"\'')
    lowered = text.lower()
    if lowered in {"true", "yes"}: return True
    if lowered in {"false", "no"}: return False
    if lowered in {"null", "none"}: return None
    try:
        return float(text) if "." in text else int(text)
    except ValueError:
        return text

def extract_output_field(output: str, field: str) -> tuple[bool, Any]:
    raw = str(output or "").strip()
    if not raw:
        return False, None
    candidate = raw
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.I | re.S).strip()
    try:
        parsed = json.loads(candidate)
    except (TypeError, ValueError, json.JSONDecodeError):
        parsed = None
    if isinstance(parsed, dict):
        current: Any = parsed
        for part in field.split("."):
            if not isinstance(current, dict):
                current = None; break
            normalized = {_normalize_key(str(k)): v for k, v in current.items()}
            key = _normalize_key(part)
            if key not in normalized:
                current = None; break
            current = normalized[key]
        if current is not None:
            return True, current
    normalized_field = _normalize_key(field)
    for line in raw.splitlines():
        if ":" not in line and "=" not in line:
            continue
        sep = ":" if ":" in line else "="
        key, value = line.split(sep, 1)
        if _normalize_key(key) == normalized_field:
            return True, _parse_scalar(value)
    return False, None

def _truthy(value: Any) -> bool:
    if isinstance(value, bool): return value
    if value is None: return False
    if isinstance(value, (int, float)): return value != 0
    return str(value).strip().lower() not in {"", "0", "false", "no", "off", "none", "null"}

def _number(value: Any) -> float | None:
    if isinstance(value, bool): return None
    try: return float(value)
    except (TypeError, ValueError): return None

def condition_matches(actual: Any, operator: str, expected: Any) -> bool:
    operator = operator.strip().lower()
    if operator == "truthy": return _truthy(actual)
    if operator == "falsy": return not _truthy(actual)
    if operator in {"greater_than", "greater_or_equal", "less_than", "less_or_equal"}:
        a, b = _number(actual), _number(expected)
        if a is None or b is None: return False
        return {"greater_than": a > b, "greater_or_equal": a >= b, "less_than": a < b, "less_or_equal": a <= b}[operator]
    if isinstance(actual, str) and isinstance(expected, str):
        left, right = actual.strip().lower(), expected.strip().lower()
    else:
        left, right = actual, expected
    if operator == "equals": return left == right
    if operator == "not_equals": return left != right
    if operator == "contains": return str(right) in str(left)
    if operator == "not_contains": return str(right) not in str(left)
    return False

def select_route_target(*, current_agent_order: int, current_output: str, routing: dict[str, Any] | None) -> tuple[int | None, dict[str, Any] | None]:
    normalized = normalize_routing_configuration(routing)
    if normalized["mode"] != "conditional":
        return None, None
    for rule in normalized["rules"]:
        if int(rule["from_agent_order"]) != current_agent_order:
            continue
        condition = rule["condition"]
        found, actual = extract_output_field(current_output, str(condition["field"]))
        if found and condition_matches(actual, str(condition["operator"]), condition.get("value")):
            return int(rule["to_agent_order"]), rule
    return None, None
