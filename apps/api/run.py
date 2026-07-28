"""Local uvicorn entry that respects PORT (default 3001)."""

from __future__ import annotations

import os
import sys


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PORT") or "3001")
    reload = "--reload" in sys.argv or os.environ.get("API_RELOAD") == "1"
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
