from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from stock_api import http_client
from stock_api.constants import DEFAULT_INTERVAL, DEFAULT_RANGE, YAHOO_CHART_BASE


@dataclass
class YahooParseResult:
    error_message: str | None
    points: list[dict[str, Any]]
    currency: str | None
    last_price: float | int | None
    symbol: str | None


def _empty(
    error_message: str,
    *,
    currency: str | None = None,
    last_price: float | int | None = None,
    symbol: str | None = None,
) -> YahooParseResult:
    return YahooParseResult(
        error_message=error_message,
        points=[],
        currency=currency,
        last_price=last_price,
        symbol=symbol,
    )


def pick_number(value: object) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return value


def _extract_quote_arrays(
    indicators: object,
) -> tuple[list[object], list[object] | None] | None:
    if not isinstance(indicators, dict):
        return None
    quote_arr = indicators.get("quote")
    if not isinstance(quote_arr, list) or not quote_arr:
        return None
    q0 = quote_arr[0]
    if not isinstance(q0, dict) or not isinstance(q0.get("close"), list):
        return None
    close = q0["close"]
    volume = q0.get("volume") if isinstance(q0.get("volume"), list) else None
    return close, volume


def parse_result(body: object) -> YahooParseResult:
    if not isinstance(body, dict):
        return _empty("Invalid JSON")
    chart = body.get("chart")
    if not isinstance(chart, dict):
        return _empty("Missing chart")
    err = chart.get("error")
    if isinstance(err, dict) and "description" in err:
        desc = err.get("description")
        return _empty(desc if isinstance(desc, str) else "Chart error")
    result = chart.get("result")
    if not isinstance(result, list) or not result:
        return _empty("No data for symbol")
    first = result[0]
    if not isinstance(first, dict):
        return _empty("No data for symbol")
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
        return _empty("No series data", currency=currency, last_price=last_price, symbol=symbol)
    extracted = _extract_quote_arrays(first.get("indicators"))
    if extracted is None or len(extracted[0]) != len(timestamps):
        return _empty("Malformed quote data", currency=currency, last_price=last_price, symbol=symbol)
    close_arr, vol_arr = extracted
    points: list[dict[str, Any]] = []
    for i, ts in enumerate(timestamps):
        close = close_arr[i]
        if not isinstance(ts, (int, float)) or isinstance(ts, bool):
            continue
        if close is None:
            continue
        if not isinstance(close, (int, float)) or isinstance(close, bool):
            continue
        volume: float | int | None = None
        if vol_arr is not None and i < len(vol_arr):
            v = vol_arr[i]
            volume = v if isinstance(v, (int, float)) and not isinstance(v, bool) else None
        points.append({"timestamp": ts, "close": close, "volume": volume})
    if not points:
        return _empty("No price points", currency=currency, last_price=last_price, symbol=symbol)
    return YahooParseResult(
        error_message=None,
        points=points,
        currency=currency,
        last_price=last_price,
        symbol=symbol,
    )


async def fetch_yahoo_chart(
    ticker: str,
    opts: dict[str, str | None] | None = None,
) -> YahooParseResult:
    opts = opts or {}
    range_ = opts.get("range") or DEFAULT_RANGE
    interval = opts.get("interval") or DEFAULT_INTERVAL
    url = f"{YAHOO_CHART_BASE}/{quote(ticker, safe='')}"
    status, text = await http_client.get_text(url, params={"range": range_, "interval": interval})
    try:
        payload: object = json.loads(text)
    except json.JSONDecodeError:
        return _empty(f"Invalid response ({status})")
    parsed = parse_result(payload)
    if status < 200 or status >= 300:
        return YahooParseResult(
            error_message=parsed.error_message or f"HTTP {status}",
            points=parsed.points,
            currency=parsed.currency,
            last_price=parsed.last_price,
            symbol=parsed.symbol,
        )
    return parsed
