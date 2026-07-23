from __future__ import annotations

import os
from pathlib import Path

DEFAULT_INTERVAL = "1d"
DEFAULT_RANGE = "max"
DEFAULT_TICKER = "AAPL"
MAJOR_INDEX_SYMBOLS = ("^GSPC", "^DJI", "^IXIC")

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT_ENV_PATH = REPO_ROOT / ".env"


def load_root_env_file() -> None:
    if not ROOT_ENV_PATH.exists():
        return

    for line in ROOT_ENV_PATH.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value
