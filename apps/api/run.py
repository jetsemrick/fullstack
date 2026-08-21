#!/usr/bin/env python3
"""Dev/start entrypoint: load root `.env`, prefer apps/api/.venv, listen on PORT (3001)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent
SRC = API_ROOT / "src"


def _reexec_venv() -> None:
    venv_py = API_ROOT / ".venv" / "bin" / "python"
    if venv_py.exists() and Path(sys.executable).resolve() != venv_py.resolve():
        os.execv(str(venv_py), [str(venv_py), *sys.argv])


def main() -> None:
    _reexec_venv()
    if str(SRC) not in sys.path:
        sys.path.insert(0, str(SRC))
    from stock_api.env import load_root_env

    load_root_env()
    try:
        import uvicorn
    except ImportError:
        print(
            "Python API dependencies are missing. From apps/api run:\n"
            "  python3 -m venv .venv && .venv/bin/pip install -e \".[dev]\"",
            file=sys.stderr,
        )
        raise SystemExit(1) from None

    port = int(os.environ.get("PORT") or 3001)
    reload = os.environ.get("API_RELOAD", "1") != "0"
    uvicorn.run(
        "stock_api.app:app",
        host="127.0.0.1",
        port=port,
        reload=reload,
        reload_dirs=[str(SRC)] if reload else None,
    )


if __name__ == "__main__":
    main()
