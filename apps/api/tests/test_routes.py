from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_rejects_invalid_ticker_with_400(client: TestClient) -> None:
    res = client.get("/api/prices", params={"ticker": "!!!"})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION"


def test_returns_400_for_invalid_range_query(client: TestClient) -> None:
    res = client.get("/api/prices", params={"ticker": "AAPL", "range": "invalid"})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION"


def test_health_check_returns_200(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_report_bug_rejects_empty_message_with_400(client: TestClient) -> None:
    res = client.post("/api/report-bug", json={"message": "   "})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION"


def test_report_bug_returns_503_when_cursor_api_key_missing(client: TestClient) -> None:
    prev = os.environ.pop("CURSOR_API_KEY", None)
    try:
        res = client.post(
            "/api/report-bug",
            json={"message": "Fix the chart legend"},
        )
        assert res.status_code == 503
        assert res.json()["code"] == "CONFIG"
    finally:
        if prev is not None:
            os.environ["CURSOR_API_KEY"] = prev


def test_returns_200_and_series_when_upstream_chart_json_is_valid(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = (FIXTURES / "minimal-chart.json").read_text()

    async def fake_get(self: httpx.AsyncClient, url: Any, **kwargs: Any) -> httpx.Response:
        u = str(url)
        if "v8/finance/chart" in u:
            return httpx.Response(200, text=fixture, headers={"content-type": "application/json"})
        return httpx.Response(404, text="not found")

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    res = client.get("/api/prices", params={"ticker": "AAPL"})
    assert res.status_code == 200
    body = res.json()
    assert body["ticker"] == "AAPL"
    assert "range" not in body
    assert len(body["series"]) == 2
    assert body["series"][0]["close"] == 198.1


def test_returns_200_and_market_context_when_yahoo_quote_json_is_valid(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    quote_fixture = (FIXTURES / "minimal-quote.json").read_text()

    async def fake_get(self: httpx.AsyncClient, url: Any, **kwargs: Any) -> httpx.Response:
        u = str(url)
        if "v7/finance/quote" in u:
            return httpx.Response(
                200, text=quote_fixture, headers={"content-type": "application/json"}
            )
        return httpx.Response(404, text="unsupported yahoo fixture")

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    res = client.get("/api/market-context")
    assert res.status_code == 200
    body = res.json()
    assert body["marketState"] == "REGULAR"
    assert [i["symbol"] for i in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]


def test_returns_200_when_v7_blocked_but_v8_chart_works(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get(self: httpx.AsyncClient, url: Any, **kwargs: Any) -> httpx.Response:
        u = str(url)
        if "v7/finance/quote" in u:
            blocked = {
                "finance": {
                    "result": None,
                    "error": {"code": "Unauthorized", "description": "blocked"},
                }
            }
            return httpx.Response(
                200,
                text=json.dumps(blocked),
                headers={"content-type": "application/json"},
            )
        if "v8/finance/chart" in u:
            decoded = unquote(u.split("/chart/")[-1].split("?")[0])
            short = {
                "^GSPC": "S&P 500",
                "^DJI": "Dow",
                "^IXIC": "NASDAQ",
            }.get(decoded, decoded)
            body = {
                "chart": {
                    "result": [
                        {
                            "meta": {
                                "symbol": decoded,
                                "shortName": short,
                                "regularMarketPrice": 100,
                                "chartPreviousClose": 99,
                                "marketState": "REGULAR",
                            }
                        }
                    ],
                    "error": None,
                }
            }
            return httpx.Response(
                200,
                text=json.dumps(body),
                headers={"content-type": "application/json"},
            )
        return httpx.Response(404, text="unsupported yahoo fixture")

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    res = client.get("/api/market-context")
    assert res.status_code == 200
    body = res.json()
    assert body["marketState"] == "REGULAR"
    assert [i["symbol"] for i in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]
    assert body["indexes"][0]["price"] == 100
