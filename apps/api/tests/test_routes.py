from __future__ import annotations

from typing import Any

import httpx
import pytest

from stock_api import main

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


async def test_rejects_invalid_ticker_with_400(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/prices?ticker=!!!")

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION"


async def test_returns_400_for_invalid_range_query(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/prices?ticker=AAPL&range=invalid")

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION"


async def test_health_check_returns_200(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_report_bug_rejects_empty_message_with_400(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/report-bug", json={"message": "   "})

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION"


async def test_report_bug_returns_503_when_cursor_api_key_is_missing(
    client: httpx.AsyncClient,
    monkeypatch: Any,
) -> None:
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)

    response = await client.post("/api/report-bug", json={"message": "Fix the chart legend"})

    assert response.status_code == 503
    assert response.json()["code"] == "CONFIG"


async def test_returns_200_and_series_when_upstream_chart_json_is_valid(
    client: httpx.AsyncClient,
    monkeypatch: Any,
) -> None:
    async def fake_fetch_yahoo_chart(ticker: str, *, range_value: str | None = None, interval: str | None = None):
        assert ticker == "AAPL"
        assert range_value is None
        assert interval is None
        return {
            "errorMessage": None,
            "currency": "USD",
            "lastPrice": 198.5,
            "symbol": "AAPL",
            "points": [
                {"timestamp": 1700000000, "close": 198.1, "volume": 1000000},
                {"timestamp": 1700086400, "close": 198.5, "volume": 1100000},
            ],
        }

    monkeypatch.setattr(main, "fetch_yahoo_chart", fake_fetch_yahoo_chart)

    response = await client.get("/api/prices?ticker=AAPL")

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert "range" not in body
    assert len(body["series"]) == 2
    assert body["series"][0]["close"] == 198.1


async def test_returns_200_and_market_context_when_yahoo_quote_json_is_valid(
    client: httpx.AsyncClient,
    monkeypatch: Any,
) -> None:
    async def fake_fetch_major_index_quotes():
        return {
            "errorMessage": None,
            "marketState": "REGULAR",
            "indexes": [
                {"symbol": "^GSPC", "shortName": "S&P 500", "price": 5980.87, "changePercent": 0.12},
                {"symbol": "^DJI", "shortName": "Dow", "price": 42000, "changePercent": -0.08},
                {"symbol": "^IXIC", "shortName": "NASDAQ", "price": 19100, "changePercent": 0.2},
            ],
        }

    monkeypatch.setattr(main, "fetch_major_index_quotes", fake_fetch_major_index_quotes)

    response = await client.get("/api/market-context")

    assert response.status_code == 200
    body = response.json()
    assert body["marketState"] == "REGULAR"
    assert [index["symbol"] for index in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]


async def test_returns_200_and_market_context_when_v8_chart_fallback_works(
    client: httpx.AsyncClient,
    monkeypatch: Any,
) -> None:
    async def fake_fetch_major_index_quotes():
        return {
            "errorMessage": None,
            "marketState": "REGULAR",
            "indexes": [
                {"symbol": "^GSPC", "shortName": "S&P 500", "price": 100, "changePercent": 1.01},
                {"symbol": "^DJI", "shortName": "Dow", "price": 100, "changePercent": 1.01},
                {"symbol": "^IXIC", "shortName": "NASDAQ", "price": 100, "changePercent": 1.01},
            ],
        }

    monkeypatch.setattr(main, "fetch_major_index_quotes", fake_fetch_major_index_quotes)

    response = await client.get("/api/market-context")

    assert response.status_code == 200
    body = response.json()
    assert body["marketState"] == "REGULAR"
    assert [index["symbol"] for index in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]
    assert body["indexes"][0]["price"] == 100
