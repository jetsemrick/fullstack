"""Defensive Yahoo Finance clients and response parsers."""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx

DEFAULT_RANGE = "max"
DEFAULT_INTERVAL = "1d"
MAJOR_INDEX_SYMBOLS = ("^GSPC", "^DJI", "^IXIC")
YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)"}
YAHOO_TIMEOUT = 15.0


@dataclass(frozen=True)
class YahooChartResult:
    error_message: str | None
    points: list[dict[str, int | float | None]]
    currency: str | None
    last_price: float | int | None
    symbol: str | None
    upstream_failure: bool = False


@dataclass(frozen=True)
class YahooQuoteAggregate:
    error_message: str | None
    market_state: str | None
    indexes: list[dict[str, str | float | int | None]]


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _pick_number(value: Any) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) else None


def parse_chart_response(body: Any) -> YahooChartResult:
    empty = {"points": [], "currency": None, "last_price": None, "symbol": None}
    if not _is_object(body):
        return YahooChartResult("Invalid JSON", **empty)
    chart = body.get("chart")
    if not _is_object(chart):
        return YahooChartResult("Missing chart", **empty)
    error = chart.get("error")
    if _is_object(error):
        description = error.get("description")
        return YahooChartResult(
            description if isinstance(description, str) else "Chart error", **empty
        )
    result = chart.get("result")
    if not isinstance(result, list) or not result or not _is_object(result[0]):
        return YahooChartResult("No data for symbol", **empty)

    first = result[0]
    meta = first.get("meta")
    meta = meta if _is_object(meta) else {}
    currency = meta.get("currency") if isinstance(meta.get("currency"), str) else None
    symbol = meta.get("symbol") if isinstance(meta.get("symbol"), str) else None
    last_price = _pick_number(meta.get("regularMarketPrice"))
    if last_price is None:
        last_price = _pick_number(meta.get("chartPreviousClose"))

    timestamps = first.get("timestamp")
    if not isinstance(timestamps, list) or not timestamps:
        return YahooChartResult("No series data", [], currency, last_price, symbol)
    indicators = first.get("indicators")
    quote_rows = indicators.get("quote") if _is_object(indicators) else None
    quote_row = quote_rows[0] if isinstance(quote_rows, list) and quote_rows else None
    closes = quote_row.get("close") if _is_object(quote_row) else None
    volumes = quote_row.get("volume") if _is_object(quote_row) else None
    if not isinstance(closes, list) or len(closes) != len(timestamps):
        return YahooChartResult("Malformed quote data", [], currency, last_price, symbol)

    points: list[dict[str, int | float | None]] = []
    for index, timestamp in enumerate(timestamps):
        close = closes[index]
        if _pick_number(timestamp) is None or _pick_number(close) is None:
            continue
        volume = None
        if isinstance(volumes, list) and index < len(volumes):
            volume = _pick_number(volumes[index])
        points.append({"timestamp": timestamp, "close": close, "volume": volume})
    if not points:
        return YahooChartResult("No price points", [], currency, last_price, symbol)
    return YahooChartResult(None, points, currency, last_price, symbol)


def _parse_quote_item(raw: Any) -> dict[str, str | float | int | None] | None:
    if not _is_object(raw) or not isinstance(raw.get("symbol"), str):
        return None
    symbol = raw["symbol"]
    short_name = raw.get("shortName")
    if not isinstance(short_name, str):
        short_name = raw.get("shortname")
    if not isinstance(short_name, str):
        short_name = symbol
    return {
        "symbol": symbol,
        "shortName": short_name,
        "price": _pick_number(raw.get("regularMarketPrice")),
        "changePercent": _pick_number(raw.get("regularMarketChangePercent")),
    }


def parse_quote_response(body: Any) -> YahooQuoteAggregate:
    if not _is_object(body):
        return YahooQuoteAggregate("Invalid JSON", None, [])
    quote_response = body.get("quoteResponse")
    if not _is_object(quote_response):
        return YahooQuoteAggregate("Missing quote response", None, [])
    error = quote_response.get("error")
    if isinstance(error, str) and error:
        return YahooQuoteAggregate(error, None, [])
    result = quote_response.get("result")
    if not isinstance(result, list):
        return YahooQuoteAggregate("Malformed quote results", None, [])

    market_state = None
    parsed_by_symbol: dict[str, dict[str, str | float | int | None]] = {}
    for item in result:
        parsed = _parse_quote_item(item)
        if parsed is None:
            continue
        parsed_by_symbol[str(parsed["symbol"])] = parsed
        state = item.get("marketState") if _is_object(item) else None
        if isinstance(state, str) and (
            parsed["symbol"] == "^GSPC" or market_state is None
        ):
            market_state = state
    indexes = [
        parsed_by_symbol[symbol]
        for symbol in MAJOR_INDEX_SYMBOLS
        if symbol in parsed_by_symbol
    ]
    if not indexes:
        return YahooQuoteAggregate("No index quotes parsed", None, [])
    return YahooQuoteAggregate(None, market_state, indexes)


async def fetch_yahoo_chart(
    ticker: str, *, chart_range: str | None = None, interval: str | None = None
) -> YahooChartResult:
    url = f"{YAHOO_CHART_BASE}/{quote(ticker, safe='')}"
    try:
        async with httpx.AsyncClient(
            headers=YAHOO_HEADERS, timeout=YAHOO_TIMEOUT
        ) as client:
            response = await client.get(
                url,
                params={
                    "range": chart_range or DEFAULT_RANGE,
                    "interval": interval or DEFAULT_INTERVAL,
                },
            )
    except httpx.HTTPError as exc:
        return YahooChartResult(
            f"Yahoo request failed: {exc.__class__.__name__}",
            [],
            None,
            None,
            None,
            upstream_failure=True,
        )
    try:
        body = response.json()
    except ValueError:
        return YahooChartResult(
            f"Invalid response ({response.status_code})",
            [],
            None,
            None,
            None,
            upstream_failure=True,
        )
    parsed = parse_chart_response(body)
    if not response.is_success:
        return YahooChartResult(
            parsed.error_message or f"HTTP {response.status_code}",
            parsed.points,
            parsed.currency,
            parsed.last_price,
            parsed.symbol,
            upstream_failure=response.status_code != 404,
        )
    return parsed


def _parse_index_chart(body: Any) -> tuple[dict[str, Any], str | None] | None:
    if not _is_object(body) or not _is_object(body.get("chart")):
        return None
    result = body["chart"].get("result")
    if not isinstance(result, list) or not result or not _is_object(result[0]):
        return None
    meta = result[0].get("meta")
    if not _is_object(meta) or not isinstance(meta.get("symbol"), str):
        return None
    symbol = meta["symbol"]
    short_name = meta.get("shortName") or meta.get("longName") or symbol
    price = _pick_number(meta.get("regularMarketPrice"))
    previous = _pick_number(meta.get("chartPreviousClose"))
    if previous is None:
        previous = _pick_number(meta.get("previousClose"))
    change_percent = None
    if price is not None and previous not in (None, 0):
        change_percent = ((price - previous) / previous) * 100
    return (
        {
            "symbol": symbol,
            "shortName": short_name if isinstance(short_name, str) else symbol,
            "price": price,
            "changePercent": change_percent,
        },
        meta.get("marketState") if isinstance(meta.get("marketState"), str) else None,
    )


def _infer_us_market_state() -> str:
    now = datetime.now(ZoneInfo("America/New_York"))
    if now.weekday() >= 5:
        return "CLOSED"
    minutes = now.hour * 60 + now.minute
    if 570 <= minutes < 960:
        return "REGULAR"
    if 240 <= minutes < 570:
        return "PRE_MARKET"
    if 960 <= minutes < 1200:
        return "POST_MARKET"
    return "CLOSED"


async def _fetch_index_chart(
    client: httpx.AsyncClient, symbol: str
) -> tuple[dict[str, Any], str | None] | None:
    try:
        response = await client.get(
            f"{YAHOO_CHART_BASE}/{quote(symbol, safe='')}",
            params={"range": "1d", "interval": "1d"},
        )
        if not response.is_success:
            return None
        return _parse_index_chart(response.json())
    except (httpx.HTTPError, ValueError):
        return None


async def _fetch_major_index_quotes_via_chart() -> YahooQuoteAggregate:
    async with httpx.AsyncClient(
        headers=YAHOO_HEADERS, timeout=YAHOO_TIMEOUT
    ) as client:
        rows = await asyncio.gather(
            *(_fetch_index_chart(client, symbol) for symbol in MAJOR_INDEX_SYMBOLS)
        )
    by_symbol = {row[0]["symbol"]: row for row in rows if row is not None}
    indexes = [
        by_symbol[symbol][0]
        for symbol in MAJOR_INDEX_SYMBOLS
        if symbol in by_symbol
    ]
    if not indexes:
        return YahooQuoteAggregate("No benchmark quotes", None, [])
    market_state = next(
        (
            by_symbol[symbol][1]
            for symbol in MAJOR_INDEX_SYMBOLS
            if symbol in by_symbol and by_symbol[symbol][1]
        ),
        None,
    )
    return YahooQuoteAggregate(None, market_state or _infer_us_market_state(), indexes)


async def fetch_major_index_quotes() -> YahooQuoteAggregate:
    try:
        async with httpx.AsyncClient(
            headers=YAHOO_HEADERS, timeout=YAHOO_TIMEOUT
        ) as client:
            response = await client.get(
                YAHOO_QUOTE_URL,
                params={"symbols": ",".join(MAJOR_INDEX_SYMBOLS)},
            )
        parsed = parse_quote_response(response.json())
        if response.is_success and not parsed.error_message and parsed.indexes:
            return parsed
        v7_error = parsed.error_message
    except (httpx.HTTPError, ValueError) as exc:
        v7_error = f"Yahoo request failed: {exc.__class__.__name__}"

    fallback = await _fetch_major_index_quotes_via_chart()
    if fallback.indexes:
        return fallback
    return YahooQuoteAggregate(
        v7_error or fallback.error_message or "No benchmark quotes", None, []
    )
