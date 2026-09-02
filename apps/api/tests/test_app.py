from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.yahoo import YahooChartResult, YahooQuoteAggregate

client = TestClient(app)


def test_health_check_returns_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_prices_rejects_invalid_ticker() -> None:
    response = client.get("/api/prices", params={"ticker": "!!!"})
    assert response.status_code == 400
    assert response.json() == {
        "error": "Invalid ticker format",
        "code": "VALIDATION",
    }


def test_prices_rejects_invalid_range_and_interval() -> None:
    range_response = client.get(
        "/api/prices", params={"ticker": "AAPL", "range": "invalid"}
    )
    interval_response = client.get(
        "/api/prices", params={"ticker": "AAPL", "interval": "invalid"}
    )
    assert range_response.status_code == 400
    assert range_response.json()["code"] == "VALIDATION"
    assert interval_response.status_code == 400
    assert interval_response.json()["code"] == "VALIDATION"


def test_prices_returns_normalized_series(monkeypatch) -> None:
    fetch = AsyncMock(
        return_value=YahooChartResult(
            None,
            [
                {"timestamp": 1700000000, "close": 198.1, "volume": 1000000},
                {"timestamp": 1700086400, "close": 198.5, "volume": 1100000},
            ],
            "USD",
            198.5,
            "AAPL",
        )
    )
    monkeypatch.setattr("app.main.fetch_yahoo_chart", fetch)

    response = client.get(
        "/api/prices",
        params={"ticker": "aapl", "range": "1mo", "interval": "1d"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "AAPL",
        "currency": "USD",
        "lastPrice": 198.5,
        "series": [
            {"timestamp": 1700000000, "close": 198.1, "volume": 1000000},
            {"timestamp": 1700086400, "close": 198.5, "volume": 1100000},
        ],
    }
    fetch.assert_awaited_once_with("AAPL", chart_range="1mo", interval="1d")


def test_prices_maps_no_data_and_upstream_failures(monkeypatch) -> None:
    fetch = AsyncMock(
        return_value=YahooChartResult(
            "No data for symbol", [], None, None, None
        )
    )
    monkeypatch.setattr("app.main.fetch_yahoo_chart", fetch)
    not_found = client.get("/api/prices", params={"ticker": "UNKNOWN"})
    assert not_found.status_code == 404
    assert not_found.json()["code"] == "NOT_FOUND"

    fetch.return_value = YahooChartResult(
        "Invalid response (503)", [], None, None, None, upstream_failure=True
    )
    upstream = client.get("/api/prices", params={"ticker": "AAPL"})
    assert upstream.status_code == 502
    assert upstream.json()["code"] == "UPSTREAM"


def test_market_context_returns_index_quotes(monkeypatch) -> None:
    indexes = [
        {
            "symbol": "^GSPC",
            "shortName": "S&P 500",
            "price": 5980.87,
            "changePercent": 0.12,
        },
        {
            "symbol": "^DJI",
            "shortName": "Dow Jones Industrial Average",
            "price": 42000,
            "changePercent": -0.08,
        },
        {
            "symbol": "^IXIC",
            "shortName": "NASDAQ Composite",
            "price": 19100,
            "changePercent": 0.2,
        },
    ]
    monkeypatch.setattr(
        "app.main.fetch_major_index_quotes",
        AsyncMock(return_value=YahooQuoteAggregate(None, "REGULAR", indexes)),
    )
    response = client.get("/api/market-context")
    assert response.status_code == 200
    assert response.json() == {"marketState": "REGULAR", "indexes": indexes}


def test_report_bug_validates_body_and_returns_compatibility_stub() -> None:
    empty = client.post("/api/report-bug", json={"message": "  "})
    assert empty.status_code == 400
    assert empty.json()["code"] == "VALIDATION"

    stub = client.post("/api/report-bug", json={"message": "Fix the chart"})
    assert stub.status_code == 503
    assert stub.json()["code"] == "CONFIG"
