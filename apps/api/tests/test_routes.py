from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from stock_api import http_client

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_rejects_invalid_ticker_with_400(client: TestClient) -> None:
    res = client.get("/api/prices", params={"ticker": "!!!"})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION"


def test_returns_400_for_invalid_range_query(client: TestClient) -> None:
    res = client.get("/api/prices", params={"ticker": "AAPL", "range": "invalid"})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION"


def test_returns_400_for_invalid_interval_query(client: TestClient) -> None:
    res = client.get("/api/prices", params={"ticker": "AAPL", "interval": "invalid"})
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


def test_report_bug_returns_503_when_cursor_api_key_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)
    res = client.post("/api/report-bug", json={"message": "Fix the chart legend"})
    assert res.status_code == 503
    assert res.json()["code"] == "CONFIG"


def test_returns_200_and_series_when_upstream_chart_json_is_valid(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fixture = (FIXTURES / "minimal-chart.json").read_text(encoding="utf-8")

    async def fake_get_text(url: str, params: dict[str, str] | None = None) -> tuple[int, str]:
        if "finance.yahoo.com" not in url:
            return 404, "not found"
        if "v8/finance/chart" in url:
            return 200, fixture
        return 404, "unsupported yahoo fixture"

    monkeypatch.setattr(http_client, "get_text", AsyncMock(side_effect=fake_get_text))
    res = client.get("/api/prices", params={"ticker": "AAPL"})
    assert res.status_code == 200
    body = res.json()
    assert body["ticker"] == "AAPL"
    assert "range" not in body
    assert len(body["series"]) == 2
    assert body["series"][0]["close"] == 198.1


def test_returns_200_and_market_context_when_yahoo_quote_json_is_valid(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    quote_fixture = (FIXTURES / "minimal-quote.json").read_text(encoding="utf-8")

    async def fake_get_text(url: str, params: dict[str, str] | None = None) -> tuple[int, str]:
        if "finance.yahoo.com" not in url:
            return 404, "not found"
        if "v7/finance/quote" in url:
            return 200, quote_fixture
        return 404, "unsupported yahoo fixture"

    monkeypatch.setattr(http_client, "get_text", AsyncMock(side_effect=fake_get_text))
    res = client.get("/api/market-context")
    assert res.status_code == 200
    body = res.json()
    assert body["marketState"] == "REGULAR"
    assert [row["symbol"] for row in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]


def test_returns_200_when_v7_quote_blocked_but_v8_chart_works(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_get_text(url: str, params: dict[str, str] | None = None) -> tuple[int, str]:
        if "finance.yahoo.com" not in url:
            return 404, "not found"
        if "v7/finance/quote" in url:
            blocked: dict[str, Any] = {
                "finance": {"result": None, "error": {"code": "Unauthorized", "description": "blocked"}}
            }
            return 200, json.dumps(blocked)
        if "v8/finance/chart" in url:
            marker = "/chart/"
            idx = url.find(marker)
            rest = url[idx + len(marker) :]
            encoded = rest.split("?", 1)[0]
            decoded = unquote(encoded)
            short = {"^GSPC": "S&P 500", "^DJI": "Dow", "^IXIC": "NASDAQ"}.get(decoded, decoded)
            payload = {
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
            return 200, json.dumps(payload)
        return 404, "unsupported yahoo fixture"

    monkeypatch.setattr(http_client, "get_text", AsyncMock(side_effect=fake_get_text))
    res = client.get("/api/market-context")
    assert res.status_code == 200
    body = res.json()
    assert body["marketState"] == "REGULAR"
    assert [row["symbol"] for row in body["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]
    assert body["indexes"][0]["price"] == 100
