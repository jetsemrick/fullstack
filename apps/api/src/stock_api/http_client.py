from __future__ import annotations

import httpx

from stock_api.constants import USER_AGENT


async def get_text(url: str, params: dict[str, str] | None = None) -> tuple[int, str]:
    """GET `url` and return `(status_code, body_text)`. Network errors propagate."""
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    ) as client:
        res = await client.get(url, params=params)
        return res.status_code, res.text
