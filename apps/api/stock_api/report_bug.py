from __future__ import annotations

import os


class ReportBugError(RuntimeError):
    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


async def run_report_bug_agent(_message: str) -> dict[str, str]:
    if not os.environ.get("CURSOR_API_KEY", "").strip():
        raise ReportBugError("CURSOR_API_KEY is not configured", "CONFIG")

    raise ReportBugError("Report bug agent is not available in the Python API", "CONFIG")
