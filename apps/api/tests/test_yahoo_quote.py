from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from stock_api import yahoo_quote
from stock_api.yahoo_quote import fetch_major_index_quotes, parse_quote_response

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_quote_response_parses_yahoo_benchmark_quote_fixture() -> None:
    body = json.loads((FIXTURES / "minimal-quote.json").read_text(encoding="utf-8"))

    out = parse_quote_response(body)

    assert out["errorMessage"] is None
    assert out["marketState"] == "REGULAR"
    assert [index["symbol"] for index in out["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]


@pytest.mark.anyio
async def test_fetch_major_index_quotes_falls_back_to_chart(monkeypatch: Any) -> None:
    async def fake_v7():
        return {"errorMessage": "blocked", "marketState": None, "indexes": []}

    async def fake_chart():
        return {
            "errorMessage": None,
            "marketState": "REGULAR",
            "indexes": [
                {"symbol": "^GSPC", "shortName": "S&P 500", "price": 100, "changePercent": 1.01},
                {"symbol": "^DJI", "shortName": "Dow", "price": 100, "changePercent": 1.01},
                {"symbol": "^IXIC", "shortName": "NASDAQ", "price": 100, "changePercent": 1.01},
            ],
        }

    monkeypatch.setattr(yahoo_quote, "_fetch_major_index_quotes_via_v7", fake_v7)
    monkeypatch.setattr(yahoo_quote, "_fetch_major_index_quotes_via_chart", fake_chart)

    out = await fetch_major_index_quotes()

    assert out["errorMessage"] is None
    assert out["marketState"] == "REGULAR"
    assert [index["symbol"] for index in out["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]
