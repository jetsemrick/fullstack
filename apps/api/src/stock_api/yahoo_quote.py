from __future__ import annotations

import asyncio
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from stock_api import http_client
from stock_api.constants import MAJOR_INDEX_SYMBOLS, YAHOO_CHART_BASE, YAHOO_QUOTE_URL


@dataclass
class YahooQuoteAggregate:
    error_message: str | None
    market_state: str | None
    indexes: list[dict[str, Any]]


def _empty(error_message: str) -> YahooQuoteAggregate:
    return YahooQuoteAggregate(error_message=error_message, market_state=None, indexes=[])


def pick_num(value: object) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return value


def infer_us_cash_market_state_utc(now_utc_ms: int) -> str:
    """Rough US equities session using Eastern clock — ignores exchange holidays."""
    dt = datetime.fromtimestamp(now_utc_ms / 1000, tz=timezone.utc).astimezone(
        ZoneInfo("America/New_York")
    )
    if dt.weekday() >= 5:
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


def parse_quote_item(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    symbol = raw.get("symbol") if isinstance(raw.get("symbol"), str) else None
    if not symbol:
        return None
    short_name = raw.get("shortName")
    if not isinstance(short_name, str):
        short_name = raw.get("shortname") if isinstance(raw.get("shortname"), str) else symbol
    return {
        "symbol": symbol,
        "shortName": short_name,
        "price": pick_num(raw.get("regularMarketPrice")),
        "changePercent": pick_num(raw.get("regularMarketChangePercent")),
    }


def parse_quote_response(body: object) -> YahooQuoteAggregate:
    if not isinstance(body, dict):
        return _empty("Invalid JSON")
    qr = body.get("quoteResponse")
    if not isinstance(qr, dict):
        return _empty("Missing quote response")
    err = qr.get("error")
    if isinstance(err, str) and len(err) > 0:
        return _empty(err)
    result = qr.get("result")
    if not isinstance(result, list):
        return _empty("Malformed quote results")

    market_state: str | None = None
    indexes: list[dict[str, Any]] = []
    for item in result:
        parsed = parse_quote_item(item)
        if not parsed:
            continue
        indexes.append(parsed)
        if (
            isinstance(item, dict)
            and item.get("symbol") == "^GSPC"
            and isinstance(item.get("marketState"), str)
        ):
            market_state = item["marketState"]

    if not indexes:
        return _empty("No index quotes parsed")

    by_symbol = {row["symbol"]: row for row in indexes}
    ordered = [by_symbol[sym] for sym in MAJOR_INDEX_SYMBOLS if sym in by_symbol]

    if not market_state:
        for item in result:
            if isinstance(item, dict) and isinstance(item.get("marketState"), str):
                market_state = item["marketState"]
                break

    return YahooQuoteAggregate(
        error_message=None,
        market_state=market_state,
        indexes=ordered if ordered else indexes,
    )


def parse_index_from_chart_body(body: object) -> dict[str, Any] | None:
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
    symbol = meta.get("symbol") if isinstance(meta.get("symbol"), str) else None
    if not symbol:
        return None
    if isinstance(meta.get("shortName"), str):
        short_name = meta["shortName"]
    elif isinstance(meta.get("longName"), str):
        short_name = meta["longName"]
    else:
        short_name = symbol
    price = pick_num(meta.get("regularMarketPrice"))
    prev = pick_num(meta.get("chartPreviousClose"))
    if prev is None:
        prev = pick_num(meta.get("previousClose"))
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


async def _fetch_one_index_chart(symbol: str) -> dict[str, Any] | None:
    url = f"{YAHOO_CHART_BASE}/{quote(symbol, safe='')}"
    status, text = await http_client.get_text(url, params={"range": "1d", "interval": "1d"})
    try:
        payload: object = json.loads(text)
    except json.JSONDecodeError:
        return None
    row = parse_index_from_chart_body(payload)
    if not row or status < 200 or status >= 300:
        return None
    return row


async def _fetch_major_index_quotes_via_chart() -> YahooQuoteAggregate:
    rows = list(await asyncio.gather(*(_fetch_one_index_chart(symbol) for symbol in MAJOR_INDEX_SYMBOLS)))

    market_state = next((r["marketState"] for r in rows if r and r.get("symbol") == "^GSPC"), None)
    if not market_state:
        market_state = next(
            (r["marketState"] for r in rows if r and isinstance(r.get("marketState"), str)),
            None,
        )

    indexes: list[dict[str, Any]] = []
    for sym in MAJOR_INDEX_SYMBOLS:
        match = next((r for r in rows if r and r.get("symbol") == sym), None)
        if match:
            indexes.append(
                {
                    "symbol": match["symbol"],
                    "shortName": match["shortName"],
                    "price": match["price"],
                    "changePercent": match["changePercent"],
                }
            )

    if not indexes:
        return _empty("No benchmark quotes")

    if not market_state:
        market_state = infer_us_cash_market_state_utc(int(datetime.now(tz=timezone.utc).timestamp() * 1000))

    return YahooQuoteAggregate(error_message=None, market_state=market_state, indexes=indexes)


async def _fetch_major_index_quotes_via_v7() -> YahooQuoteAggregate:
    status, text = await http_client.get_text(
        YAHOO_QUOTE_URL,
        params={"symbols": ",".join(MAJOR_INDEX_SYMBOLS)},
    )
    try:
        payload: object = json.loads(text)
    except json.JSONDecodeError:
        return _empty(f"Invalid response ({status})")
    parsed = parse_quote_response(payload)
    if status < 200 or status >= 300:
        return YahooQuoteAggregate(
            error_message=parsed.error_message or f"HTTP {status}",
            market_state=parsed.market_state,
            indexes=parsed.indexes,
        )
    return parsed


async def fetch_major_index_quotes() -> YahooQuoteAggregate:
    v7 = await _fetch_major_index_quotes_via_v7()
    if not v7.error_message and v7.indexes:
        return v7
    via_chart = await _fetch_major_index_quotes_via_chart()
    if via_chart.indexes:
        return YahooQuoteAggregate(
            error_message=None,
            market_state=via_chart.market_state,
            indexes=via_chart.indexes,
        )
    return YahooQuoteAggregate(
        error_message=v7.error_message or via_chart.error_message or "No benchmark quotes",
        market_state=None,
        indexes=[],
    )
