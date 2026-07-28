from __future__ import annotations

import json
from pathlib import Path

from app.yahoo import parse_result

FIXTURES = Path(__file__).parent / "fixtures"


def test_parses_minimal_yahoo_chart_payload() -> None:
    body = json.loads((FIXTURES / "minimal-chart.json").read_text())
    out = parse_result(body)
    assert out["errorMessage"] is None
    assert out["currency"] == "USD"
    assert out["symbol"] == "AAPL"
    assert out["lastPrice"] == 198.5
    assert len(out["points"]) == 2
    assert out["points"][0] == {
        "timestamp": 1700000000,
        "close": 198.1,
        "volume": 1000000.0,
    }
    assert out["points"][1] == {
        "timestamp": 1700086400,
        "close": 198.5,
        "volume": 1100000.0,
    }


def test_returns_error_for_invalid_json_shape() -> None:
    out = parse_result(None)
    assert out["errorMessage"] == "Invalid JSON"
    assert out["points"] == []


def test_returns_error_when_chart_error_object_present() -> None:
    out = parse_result({"chart": {"error": {"description": "Invalid symbol"}}})
    assert out["errorMessage"] == "Invalid symbol"
    assert out["points"] == []
