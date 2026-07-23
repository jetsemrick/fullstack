from __future__ import annotations

import math
from typing import Any, TypedDict
from urllib.parse import quote

import httpx

from .config import DEFAULT_INTERVAL, DEFAULT_RANGE

YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)"}


class PricePoint(TypedDict):
    timestamp: int | float
    close: int | float
    volume: int | float | None


class YahooParseResult(TypedDict):
    errorMessage: str | None
    points: list[PricePoint]
    currency: str | None
    lastPrice: int | float | None
    symbol: str | None


def _empty(
    error_message: str | None,
    *,
    currency: str | None = None,
    last_price: int | float | None = None,
    symbol: str | None = None,
) -> YahooParseResult:
    return {
        "errorMessage": error_message,
        "points": [],
        "currency": currency,
        "lastPrice": last_price,
        "symbol": symbol,
    }


def pick_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) else None


def parse_result(body: Any) -> YahooParseResult:
    if not isinstance(body, dict):
        return _empty("Invalid JSON")

    chart = body.get("chart")
    if not isinstance(chart, dict):
        return _empty("Missing chart")

    error = chart.get("error")
    if isinstance(error, dict) and "description" in error:
        description = error.get("description")
        return _empty(description if isinstance(description, str) else "Chart error")

    result = chart.get("result")
    if not isinstance(result, list) or not result:
        return _empty("No data for symbol")

    first = result[0]
    if not isinstance(first, dict):
        return _empty("No data for symbol")

    meta = first.get("meta")
    meta_obj = meta if isinstance(meta, dict) else {}
    currency = meta_obj.get("currency") if isinstance(meta_obj.get("currency"), str) else None
    symbol = meta_obj.get("symbol") if isinstance(meta_obj.get("symbol"), str) else None
    last_price = pick_number(meta_obj.get("regularMarketPrice"))
    if last_price is None:
        last_price = pick_number(meta_obj.get("chartPreviousClose"))

    timestamps = first.get("timestamp")
    if not isinstance(timestamps, list) or not timestamps:
        return _empty("No series data", currency=currency, last_price=last_price, symbol=symbol)

    quote = _extract_quote_arrays(first.get("indicators"))
    if quote is None or len(quote["close"]) != len(timestamps):
        return _empty("Malformed quote data", currency=currency, last_price=last_price, symbol=symbol)

    points: list[PricePoint] = []
    volumes = quote["volume"]
    for index, timestamp in enumerate(timestamps):
        close = quote["close"][index]
        if not isinstance(timestamp, (int, float)) or isinstance(timestamp, bool):
            continue
        if close is None:
            continue
        if not isinstance(close, (int, float)) or isinstance(close, bool):
            continue

        volume: int | float | None = None
        if volumes is not None and index < len(volumes):
            raw_volume = volumes[index]
            volume = raw_volume if isinstance(raw_volume, (int, float)) and not isinstance(raw_volume, bool) else None
        points.append({"timestamp": timestamp, "close": close, "volume": volume})

    if not points:
        return _empty("No price points", currency=currency, last_price=last_price, symbol=symbol)

    return {
        "errorMessage": None,
        "points": points,
        "currency": currency,
        "lastPrice": last_price,
        "symbol": symbol,
    }


def _extract_quote_arrays(indicators: Any) -> dict[str, list[Any] | None] | None:
    if not isinstance(indicators, dict):
        return None
    quote_array = indicators.get("quote")
    if not isinstance(quote_array, list) or not quote_array:
        return None
    quote = quote_array[0]
    if not isinstance(quote, dict) or not isinstance(quote.get("close"), list):
        return None
    volume = quote.get("volume") if isinstance(quote.get("volume"), list) else None
    return {"close": quote["close"], "volume": volume}


async def fetch_yahoo_chart(
    ticker: str,
    *,
    range_value: str | None = None,
    interval: str | None = None,
) -> YahooParseResult:
    url = f"{YAHOO_CHART_BASE}/{quote(ticker, safe='')}"
    params = {"range": range_value or DEFAULT_RANGE, "interval": interval or DEFAULT_INTERVAL}
    async with httpx.AsyncClient(headers=YAHOO_HEADERS, timeout=10.0) as client:
        response = await client.get(url, params=params)

    try:
        body = response.json()
    except ValueError:
        return _empty(f"Invalid response ({response.status_code})")

    parsed = parse_result(body)
    if response.is_error:
        return {**parsed, "errorMessage": parsed["errorMessage"] or f"HTTP {response.status_code}"}
    return parsed
