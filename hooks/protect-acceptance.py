#!/usr/bin/env python3
"""Refuse agent writes to human-owned behavior sentences and pipeline files.

The script reads one JSON object on stdin and prints a permission decision.
It allows reads. It denies writes that touch acceptance/examples/,
.github/workflows/, and ci/check_acceptance_guard.py.

Shell commands that only read those paths, or that run a test command against
them, are allowed. Anything else that names those paths is denied.
A payload this script does not understand is allowed, so a schema change
cannot freeze the session. The CI guard remains the merge verdict.
"""

from __future__ import annotations

import json
import re
import sys

DENY_REASON = (
    "Touchstone keeps acceptance/examples, .github/workflows, and "
    "ci/check_acceptance_guard.py for a person to edit."
)

READ_TOOLS = {
    "read",
    "grep",
    "glob",
    "webfetch",
    "websearch",
    "readlints",
    "semanticsearch",
}
PATH_KEYS = {
    "path",
    "file_path",
    "filepath",
    "target_file",
    "target_notebook",
    "notebook_path",
}
SHELL_TOOLS = {"bash", "shell"}
WRITE_HINTS = re.compile(
    r"(?:^|[;&|]\s*)(?:rm|mv|cp|tee|touch|mkdir|truncate|dd|unlink)\b"
    r"|\bsed\b[^\n]*\s-[^\n]*i"
    r"|\bperl\b[^\n]*\s-[^\n]*i"
    r"|\bgit\s+(?:checkout|restore|clean|apply|am)\b",
    re.IGNORECASE,
)
READ_OR_TEST = re.compile(
    r"(?:^|[;&|]\s*)(?:"
    r"cat|ls|rg|grep|head|tail|wc|bat|less|stat|file|find|"
    r"git\s+(?:diff|show|log|status|blame)|"
    r"pytest|mvn|mvnw|gradle|gradlew|"
    r"npm\s+test|pnpm\s+test|yarn\s+test|"
    r"go\s+test|cargo\s+test|bun\s+test"
    r")\b",
    re.IGNORECASE,
)


PROTECTED_DIRS = (
    "acceptance/examples",
    ".github/workflows",
)
PROTECTED_FILES = (
    "ci/check_acceptance_guard.py",
)


def is_protected(path: str) -> bool:
    normalized = path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    for marker in PROTECTED_FILES:
        if normalized == marker or normalized.endswith("/" + marker):
            return True
    for marker in PROTECTED_DIRS:
        if normalized == marker or normalized.startswith(marker + "/"):
            return True
        if f"/{marker}/" in normalized or normalized.endswith("/" + marker):
            return True
    return False


def iter_paths(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in PATH_KEYS and isinstance(item, str):
                yield item
            else:
                yield from iter_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_paths(item)


def tool_name(payload: dict) -> str:
    for key in ("tool_name", "toolName", "name"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        for key in ("tool_name", "toolName"):
            value = tool_input.get(key)
            if isinstance(value, str):
                return value
    return ""


def command_text(payload: dict) -> str:
    command = payload.get("command")
    if isinstance(command, str):
        return command
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        command = tool_input.get("command")
        if isinstance(command, str):
            return command
    return ""


def mentions_protected(text: str) -> bool:
    normalized = text.replace("\\", "/")
    needles = (*PROTECTED_DIRS, *PROTECTED_FILES)
    return any(needle in normalized for needle in needles)


def has_file_redirect(command: str) -> bool:
    cleaned = re.sub(r"\d*>&[12]", "", command)
    cleaned = re.sub(r">&[12]", "", cleaned)
    return ">" in cleaned


def shell_writes_protected(command: str) -> bool:
    if not mentions_protected(command):
        return False
    parts = re.split(r"\s*(?:&&|\|\||;|\n)\s*", command)
    for part in parts:
        if not part or not mentions_protected(part):
            continue
        if has_file_redirect(part) or WRITE_HINTS.search(part):
            return True
        if READ_OR_TEST.search(part):
            continue
        return True
    return False


def wants_deny(payload: dict) -> str | None:
    name = tool_name(payload).lower()
    command = command_text(payload)
    if name in SHELL_TOOLS or (command and not name):
        if shell_writes_protected(command):
            return DENY_REASON
        if name in SHELL_TOOLS:
            return None
    if name in READ_TOOLS:
        return None
    for path in iter_paths(payload):
        if is_protected(path):
            return DENY_REASON
    return None


def emit(payload: dict, reason: str | None) -> None:
    event = payload.get("hook_event_name") or payload.get("hookEventName")
    decision = {"permission": "deny" if reason else "allow"}
    if reason:
        decision["user_message"] = reason
        decision["agent_message"] = reason
    if event:
        specific = {
            "hookEventName": event,
            "permissionDecision": "deny" if reason else "allow",
        }
        if reason:
            specific["permissionDecisionReason"] = reason
        decision["hookSpecificOutput"] = specific
    json.dump(decision, sys.stdout)
    sys.stdout.write("\n")


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        emit({}, None)
        return 0
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        emit({}, None)
        return 0
    if not isinstance(payload, dict):
        emit({}, None)
        return 0
    try:
        emit(payload, wants_deny(payload))
    except Exception:
        emit(payload, None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
