"""Yahoo Finance major-index quotes (v7 with v8 chart fallback)."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx

from .constants import MAJOR_INDEX_SYMBOLS
from .yahoo import USER_AGENT, YAHOO_CHART_BASE, pick_number

YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"


def infer_us_cash_market_state_utc(now_utc_ms: float) -> str:
    """Rough US equities session using Eastern clock — ignores exchange holidays."""
    dt = datetime.fromtimestamp(now_utc_ms / 1000.0, tz=ZoneInfo("America/New_York"))
    dow = dt.strftime("%a")
    if dow in ("Sat", "Sun"):
        return "CLOSED"
    hm = dt.hour * 60 + dt.minute
    rth_open = 9 * 60 + 30
    rth_close = 16 * 60
    pre_open = 4 * 60
    post_close = 20 * 60
    if rth_open <= hm < rth_close:
        return "REGULAR"
    if pre_open <= hm < rth_open:
        return "PRE_MARKET"
    if rth_close <= hm < post_close:
        return "POST_MARKET"
    return "CLOSED"


def parse_quote_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    symbol = raw.get("symbol")
    if not isinstance(symbol, str):
        return None
    short_name = raw.get("shortName")
    if not isinstance(short_name, str):
        short_name = raw.get("shortname")
    if not isinstance(short_name, str):
        short_name = symbol
    return {
        "symbol": symbol,
        "shortName": short_name,
        "price": pick_number(raw.get("regularMarketPrice")),
        "changePercent": pick_number(raw.get("regularMarketChangePercent")),
    }


def parse_quote_response(body: Any) -> dict[str, Any]:
    empty = {"errorMessage": None, "marketState": None, "indexes": []}
    if not isinstance(body, dict):
        return {**empty, "errorMessage": "Invalid JSON"}
    qr = body.get("quoteResponse")
    if not isinstance(qr, dict):
        return {**empty, "errorMessage": "Missing quote response"}
    err = qr.get("error")
    if isinstance(err, str) and len(err) > 0:
        return {**empty, "errorMessage": err}
    result = qr.get("result")
    if not isinstance(result, list):
        return {**empty, "errorMessage": "Malformed quote results"}

    market_state: str | None = None
    indexes: list[dict[str, Any]] = []
    for item in result:
        q = parse_quote_item(item)
        if not q:
            continue
        indexes.append(q)
        if isinstance(item, dict) and item.get("symbol") == "^GSPC":
            ms = item.get("marketState")
            if isinstance(ms, str):
                market_state = ms

    if not indexes:
        return {**empty, "errorMessage": "No index quotes parsed"}

    by_symbol = {i["symbol"]: i for i in indexes}
    ordered = [by_symbol[sym] for sym in MAJOR_INDEX_SYMBOLS if sym in by_symbol]

    if not market_state:
        for item in result:
            if isinstance(item, dict):
                ms = item.get("marketState")
                if isinstance(ms, str):
                    market_state = ms
                    break

    return {
        "errorMessage": None,
        "marketState": market_state,
        "indexes": ordered if ordered else indexes,
    }


def parse_index_from_chart_body(body: Any) -> dict[str, Any] | None:
    if not isinstance(body, dict):
        return None
    chart = body.get("chart")
    if not isinstance(chart, dict):
        return None
    result = chart.get("result")
    if not isinstance(result, list) or not result:
        return None
    first = result[0]
    if not isinstance(first, dict):
        return None
    meta = first.get("meta")
    if not isinstance(meta, dict):
        return None
    symbol = meta.get("symbol")
    if not isinstance(symbol, str):
        return None
    short_name = meta.get("shortName")
    if not isinstance(short_name, str):
        short_name = meta.get("longName")
    if not isinstance(short_name, str):
        short_name = symbol
    price = pick_number(meta.get("regularMarketPrice"))
    prev = pick_number(meta.get("chartPreviousClose"))
    if prev is None:
        prev = pick_number(meta.get("previousClose"))
    change_percent = None
    if price is not None and prev is not None and prev != 0:
        change_percent = ((price - prev) / prev) * 100
    market_state = meta.get("marketState") if isinstance(meta.get("marketState"), str) else None
    return {
        "symbol": symbol,
        "shortName": short_name,
        "price": price,
        "changePercent": change_percent,
        "marketState": market_state,
    }


async def _fetch_index_chart_row(
    client: httpx.AsyncClient,
    symbol: str,
    headers: dict[str, str],
) -> dict[str, Any] | None:
    path = f"{YAHOO_CHART_BASE}/{quote(symbol, safe='')}"
    res = await client.get(
        path,
        params={"range": "1d", "interval": "1d"},
        headers=headers,
    )
    try:
        json_body: Any = res.json()
    except Exception:
        return None
    row = parse_index_from_chart_body(json_body)
    if not row or not res.is_success:
        return None
    return row


async def fetch_major_index_quotes_via_chart(
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    headers = {"User-Agent": USER_AGENT}
    rows = list(
        await asyncio.gather(
            *[_fetch_index_chart_row(client, symbol, headers) for symbol in MAJOR_INDEX_SYMBOLS]
        )
    )

    market_state = None
    for r in rows:
        if r and r.get("symbol") == "^GSPC" and isinstance(r.get("marketState"), str):
            market_state = r["marketState"]
            break
    if not market_state:
        for r in rows:
            if r and isinstance(r.get("marketState"), str):
                market_state = r["marketState"]
                break

    indexes: list[dict[str, Any]] = []
    for sym in MAJOR_INDEX_SYMBOLS:
        r = next((x for x in rows if x and x.get("symbol") == sym), None)
        if r:
            indexes.append(
                {
                    "symbol": r["symbol"],
                    "shortName": r["shortName"],
                    "price": r["price"],
                    "changePercent": r["changePercent"],
                }
            )

    if not indexes:
        return {"errorMessage": "No benchmark quotes", "marketState": None, "indexes": []}

    if not market_state:
        market_state = infer_us_cash_market_state_utc(datetime.now().timestamp() * 1000)

    return {"errorMessage": None, "marketState": market_state, "indexes": indexes}


async def fetch_major_index_quotes_via_v7(
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    headers = {"User-Agent": USER_AGENT}
    res = await client.get(
        YAHOO_QUOTE_URL,
        params={"symbols": ",".join(MAJOR_INDEX_SYMBOLS)},
        headers=headers,
    )
    try:
        json_body: Any = res.json()
    except Exception:
        return {
            "errorMessage": f"Invalid response ({res.status_code})",
            "marketState": None,
            "indexes": [],
        }
    parsed = parse_quote_response(json_body)
    if not res.is_success:
        return {
            **parsed,
            "errorMessage": parsed["errorMessage"] or f"HTTP {res.status_code}",
        }
    return parsed


async def fetch_major_index_quotes(
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=30.0)
    try:
        v7 = await fetch_major_index_quotes_via_v7(client)
        if not v7["errorMessage"] and v7["indexes"]:
            return v7
        via_chart = await fetch_major_index_quotes_via_chart(client)
        if via_chart["indexes"]:
            return {**via_chart, "errorMessage": None}
        return {
            "errorMessage": v7["errorMessage"]
            or via_chart["errorMessage"]
            or "No benchmark quotes",
            "marketState": None,
            "indexes": [],
        }
    finally:
        if owns_client:
            await client.aclose()
