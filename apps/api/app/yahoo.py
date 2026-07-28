"""Yahoo Finance chart fetch and defensive parsing."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from .constants import DEFAULT_INTERVAL, DEFAULT_RANGE

YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
USER_AGENT = "Mozilla/5.0 (compatible; StockVisualizer/1.0)"


def pick_number(v: Any) -> float | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = float(v)
        if n == n and n not in (float("inf"), float("-inf")):
            return n
    return None


def extract_quote_arrays(
    indicators: Any,
) -> tuple[list[Any], list[Any] | None] | None:
    if not isinstance(indicators, dict):
        return None
    quote_arr = indicators.get("quote")
    if not isinstance(quote_arr, list) or not quote_arr:
        return None
    q0 = quote_arr[0]
    if not isinstance(q0, dict) or not isinstance(q0.get("close"), list):
        return None
    volume = q0.get("volume") if isinstance(q0.get("volume"), list) else None
    return q0["close"], volume


def parse_result(body: Any) -> dict[str, Any]:
    empty = {
        "errorMessage": None,
        "points": [],
        "currency": None,
        "lastPrice": None,
        "symbol": None,
    }
    if not isinstance(body, dict):
        return {**empty, "errorMessage": "Invalid JSON"}
    chart = body.get("chart")
    if not isinstance(chart, dict):
        return {**empty, "errorMessage": "Missing chart"}
    err = chart.get("error")
    if isinstance(err, dict) and "description" in err:
        d = err.get("description")
        return {
            **empty,
            "errorMessage": d if isinstance(d, str) else "Chart error",
        }
    result = chart.get("result")
    if not isinstance(result, list) or not result:
        return {**empty, "errorMessage": "No data for symbol"}
    first = result[0]
    if not isinstance(first, dict):
        return {**empty, "errorMessage": "No data for symbol"}
    meta = first.get("meta")
    currency = None
    last_price = None
    symbol = None
    if isinstance(meta, dict):
        if isinstance(meta.get("currency"), str):
            currency = meta["currency"]
        last_price = pick_number(meta.get("regularMarketPrice"))
        if last_price is None:
            last_price = pick_number(meta.get("chartPreviousClose"))
        if isinstance(meta.get("symbol"), str):
            symbol = meta["symbol"]
    timestamps = first.get("timestamp")
    if not isinstance(timestamps, list) or len(timestamps) == 0:
        return {
            "errorMessage": "No series data",
            "points": [],
            "currency": currency,
            "lastPrice": last_price,
            "symbol": symbol,
        }
    quote = extract_quote_arrays(first.get("indicators"))
    if quote is None or len(quote[0]) != len(timestamps):
        return {
            "errorMessage": "Malformed quote data",
            "points": [],
            "currency": currency,
            "lastPrice": last_price,
            "symbol": symbol,
        }
    closes, volumes = quote
    points: list[dict[str, Any]] = []
    for i, ts in enumerate(timestamps):
        close = closes[i]
        if not isinstance(ts, (int, float)) or isinstance(ts, bool):
            continue
        if close is None:
            continue
        if not isinstance(close, (int, float)) or isinstance(close, bool):
            continue
        volume: float | None = None
        if volumes is not None and i < len(volumes):
            v = volumes[i]
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                volume = float(v)
            elif v is None:
                volume = None
        points.append({"timestamp": int(ts), "close": float(close), "volume": volume})
    if not points:
        return {
            "errorMessage": "No price points",
            "points": [],
            "currency": currency,
            "lastPrice": last_price,
            "symbol": symbol,
        }
    return {
        "errorMessage": None,
        "points": points,
        "currency": currency,
        "lastPrice": last_price,
        "symbol": symbol,
    }


async def fetch_yahoo_chart(
    ticker: str,
    *,
    range_: str | None = None,
    interval: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    path = f"{YAHOO_CHART_BASE}/{quote(ticker, safe='')}"
    params = {
        "range": range_ if range_ is not None else DEFAULT_RANGE,
        "interval": interval if interval is not None else DEFAULT_INTERVAL,
    }
    headers = {"User-Agent": USER_AGENT}
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=30.0)
    try:
        res = await client.get(path, params=params, headers=headers)
        try:
            json_body: Any = res.json()
        except Exception:
            return {
                "errorMessage": f"Invalid response ({res.status_code})",
                "points": [],
                "currency": None,
                "lastPrice": None,
                "symbol": None,
            }
        parsed = parse_result(json_body)
        if not res.is_success:
            return {
                **parsed,
                "errorMessage": parsed["errorMessage"] or f"HTTP {res.status_code}",
            }
        return parsed
    finally:
        if owns_client:
            await client.aclose()
