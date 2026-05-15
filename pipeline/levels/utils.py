import ast
import json

import pandas as pd


MISSING_STRINGS = {"", "unknown", "error", "null", "none"}


def is_missing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in MISSING_STRINGS
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def to_bool(value, default=False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not pd.isna(value):
        return value != 0
    if isinstance(value, str):
        value = value.strip().lower()
        if value in {"true", "1", "yes", "y", "on"}:
            return True
        if value in {"false", "0", "no", "n", "off", "", "null", "none", "unknown"}:
            return False
    return default


def to_int(value, default=0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def to_list(value) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if value is None:
        return []
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        if value.startswith("["):
            for parser in (json.loads, ast.literal_eval):
                try:
                    parsed = parser(value)
                    return parsed if isinstance(parsed, list) else []
                except (SyntaxError, ValueError, TypeError, json.JSONDecodeError):
                    continue
        return [value]
    return []


def to_float(value, default=None):
    if value is None:
        return default
    if isinstance(value, bool):
        return float(value)
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_float_list(value) -> list[float]:
    numbers = []
    for item in to_list(value):
        number = to_float(item)
        if number is not None:
            numbers.append(number)
    return numbers


def add_rule_hit(rule_hits, level, rule_code, rule_name, weight, reason):
    rule_hits.append({
        "level": level,
        "rule_code": rule_code,
        "rule_name": rule_name,
        "weight": weight,
        "reason": reason,
    })
