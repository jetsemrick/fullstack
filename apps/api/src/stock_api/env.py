from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def repo_root() -> Path:
    """Monorepo root (`apps/api/src/stock_api` → four parents)."""
    return Path(__file__).resolve().parents[4]


def load_root_env() -> None:
    """Load monorepo-root `.env` without overriding variables already set."""
    env_path = repo_root() / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)
