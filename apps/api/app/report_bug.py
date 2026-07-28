"""Report-bug stub — @cursor/sdk is TypeScript-only; Python defers agent runs."""

from __future__ import annotations

import os
from typing import Any


class ReportBugError(Exception):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


async def run_report_bug_agent(user_message: str) -> dict[str, Any]:
    """Validate env and return a compatible stub response when the SDK is unavailable."""
    api_key = (os.environ.get("CURSOR_API_KEY") or "").strip()
    if not api_key:
        raise ReportBugError("CURSOR_API_KEY is not configured", "CONFIG")
    # Thin stub: keep request contract, document that agent execution is deferred.
    return {
        "runId": "python-api-stub",
        "status": "error",
        "error": (
            "Report-bug Cursor agent (@cursor/sdk) is not ported to the Python API. "
            "Set up is documented as deferred; validation and CONFIG errors still match the prior API."
        ),
    }
