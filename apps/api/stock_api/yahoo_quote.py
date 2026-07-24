from __future__ import annotations

import math
from datetime import datetime
from typing import Any, TypedDict
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx

from .config import MAJOR_INDEX_SYMBOLS
from .yahoo import YAHOO_HEADERS, pick_number

YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"


class MarketIndexQuote(TypedDict):
    symbol: str
    shortName: str
    price: int | float | None
    changePercent: int | float | None


class YahooQuoteAggregate(TypedDict):
    errorMessage: str | None
    marketState: str | None
    indexes: list[MarketIndexQuote]


class ChartIndexQuote(MarketIndexQuote):
    marketState: str | None


def _quote_empty(error_message: str | None) -> YahooQuoteAggregate:
    return {"errorMessage": error_message, "marketState": None, "indexes": []}


def parse_quote_response(body: Any) -> YahooQuoteAggregate:
    if not isinstance(body, dict):
        return _quote_empty("Invalid JSON")

    quote_response = body.get("quoteResponse")
    if not isinstance(quote_response, dict):
        return _quote_empty("Missing quote response")

    error = quote_response.get("error")
    if isinstance(error, str) and error:
        return _quote_empty(error)

    result = quote_response.get("result")
    if not isinstance(result, list):
        return _quote_empty("Malformed quote results")

    market_state: str | None = None
    indexes: list[MarketIndexQuote] = []
    for item in result:
        quote = _parse_quote_item(item)
        if quote is None:
            continue
        indexes.append(quote)
        if isinstance(item, dict) and item.get("symbol") == "^GSPC" and isinstance(item.get("marketState"), str):
            market_state = item["marketState"]

    if not indexes:
        return _quote_empty("No index quotes parsed")

    ordered = [row for symbol in MAJOR_INDEX_SYMBOLS for row in indexes if row["symbol"] == symbol]
    if market_state is None:
        for item in result:
            if isinstance(item, dict) and isinstance(item.get("marketState"), str):
                market_state = item["marketState"]
                break

    return {"errorMessage": None, "marketState": market_state, "indexes": ordered or indexes}


def infer_us_cash_market_state_utc(now_utc_ms: int | float) -> str:
    now = datetime.fromtimestamp(now_utc_ms / 1000, tz=ZoneInfo("UTC")).astimezone(ZoneInfo("America/New_York"))
    if now.weekday() >= 5:
        return "CLOSED"

    minutes = now.hour * 60 + now.minute
    regular_open = 9 * 60 + 30
    regular_close = 16 * 60
    pre_open = 4 * 60
    post_close = 20 * 60

    if regular_open <= minutes < regular_close:
        return "REGULAR"
    if pre_open <= minutes < regular_open:
        return "PRE_MARKET"
    if regular_close <= minutes < post_close:
        return "POST_MARKET"
    return "CLOSED"


def _parse_quote_item(raw: Any) -> MarketIndexQuote | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("symbol"), str):
        return None

    symbol = raw["symbol"]
    short_name = raw.get("shortName") if isinstance(raw.get("shortName"), str) else raw.get("shortname")
    return {
        "symbol": symbol,
        "shortName": short_name if isinstance(short_name, str) else symbol,
        "price": pick_number(raw.get("regularMarketPrice")),
        "changePercent": pick_number(raw.get("regularMarketChangePercent")),
    }


def _parse_index_from_chart_body(body: Any) -> ChartIndexQuote | None:
    if not isinstance(body, dict):
        return None
    chart = body.get("chart")
    if not isinstance(chart, dict):
        return None
    result = chart.get("result")
    if not isinstance(result, list) or not result or not isinstance(result[0], dict):
        return None
    meta = result[0].get("meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("symbol"), str):
        return None

    symbol = meta["symbol"]
    raw_short_name = meta.get("shortName") if isinstance(meta.get("shortName"), str) else meta.get("longName")
    price = pick_number(meta.get("regularMarketPrice"))
    previous = pick_number(meta.get("chartPreviousClose"))
    if previous is None:
        previous = pick_number(meta.get("previousClose"))

    change_percent = None
    if price is not None and previous is not None and previous != 0 and math.isfinite(previous):
        change_percent = ((price - previous) / previous) * 100

    return {
        "symbol": symbol,
        "shortName": raw_short_name if isinstance(raw_short_name, str) else symbol,
        "price": price,
        "changePercent": change_percent,
        "marketState": meta["marketState"] if isinstance(meta.get("marketState"), str) else None,
    }


async def _fetch_major_index_quotes_via_v7() -> YahooQuoteAggregate:
    params = {"symbols": ",".join(MAJOR_INDEX_SYMBOLS)}
    async with httpx.AsyncClient(headers=YAHOO_HEADERS, timeout=10.0) as client:
        response = await client.get(YAHOO_QUOTE_URL, params=params)

    try:
        body = response.json()
    except ValueError:
        return _quote_empty(f"Invalid response ({response.status_code})")

    parsed = parse_quote_response(body)
    if response.is_error:
        return {**parsed, "errorMessage": parsed["errorMessage"] or f"HTTP {response.status_code}"}
    return parsed


async def _fetch_major_index_quotes_via_chart() -> YahooQuoteAggregate:
    async with httpx.AsyncClient(headers=YAHOO_HEADERS, timeout=10.0) as client:
        responses = await _fetch_chart_rows(client)

    rows = [row for row in responses if row is not None]
    indexes: list[MarketIndexQuote] = [
        {
            "symbol": row["symbol"],
            "shortName": row["shortName"],
            "price": row["price"],
            "changePercent": row["changePercent"],
        }
        for symbol in MAJOR_INDEX_SYMBOLS
        for row in rows
        if row["symbol"] == symbol
    ]

    if not indexes:
        return _quote_empty("No benchmark quotes")

    market_state = next((row["marketState"] for row in rows if row["symbol"] == "^GSPC" and row["marketState"]), None)
    if market_state is None:
        market_state = next((row["marketState"] for row in rows if row["marketState"]), None)
    if market_state is None:
        market_state = infer_us_cash_market_state_utc(datetime.now(tz=ZoneInfo("UTC")).timestamp() * 1000)

    return {"errorMessage": None, "marketState": market_state, "indexes": indexes}


async def _fetch_chart_rows(client: httpx.AsyncClient) -> list[ChartIndexQuote | None]:
    rows: list[ChartIndexQuote | None] = []
    for symbol in MAJOR_INDEX_SYMBOLS:
        response = await client.get(f"{YAHOO_CHART_BASE}/{quote(symbol, safe='')}", params={"range": "1d", "interval": "1d"})
        try:
            body = response.json()
        except ValueError:
            rows.append(None)
            continue
        rows.append(_parse_index_from_chart_body(body) if not response.is_error else None)
    return rows


async def fetch_major_index_quotes() -> YahooQuoteAggregate:
    v7 = await _fetch_major_index_quotes_via_v7()
    if v7["errorMessage"] is None and v7["indexes"]:
        return v7

    via_chart = await _fetch_major_index_quotes_via_chart()
    if via_chart["indexes"]:
        return {**via_chart, "errorMessage": None}

    return {
        "errorMessage": v7["errorMessage"] or via_chart["errorMessage"] or "No benchmark quotes",
        "marketState": None,
        "indexes": [],
    }
