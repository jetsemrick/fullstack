from __future__ import annotations

import os
from typing import Any

from stock_api.constants import REPORT_BUG_MAX_LEN


class AgentError(Exception):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


def run_report_bug_agent(message: str) -> dict[str, Any]:
    """Validate config and run the report-bug agent.

    `@cursor/sdk` is TypeScript-only. This Python API keeps the same HTTP
    validation and `CURSOR_API_KEY` gate, then returns a typed UPSTREAM error
    instead of spawning a Cursor local agent.
    """
    api_key = (os.environ.get("CURSOR_API_KEY") or "").strip()
    if not api_key:
        raise AgentError("CURSOR_API_KEY is not configured", "CONFIG")
    raise AgentError(
        "Report-bug Cursor SDK agent is not available in the Python API",
        "UPSTREAM",
    )


def validate_report_bug_body(raw: object) -> str | tuple[str, str]:
    """Return trimmed message, or `(error, code)` on validation failure."""
    if raw is None or not isinstance(raw, dict) or isinstance(raw, list):
        return ("Body must be an object", "VALIDATION")
    message_raw = raw.get("message")
    if not isinstance(message_raw, str):
        return ("message must be a string", "VALIDATION")
    message = message_raw.strip()
    if not message:
        return ("message is required", "VALIDATION")
    if len(message) > REPORT_BUG_MAX_LEN:
        return (f"message must be at most {REPORT_BUG_MAX_LEN} characters", "VALIDATION")
    return message
