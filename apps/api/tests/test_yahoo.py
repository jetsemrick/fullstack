from __future__ import annotations

import json
from pathlib import Path

from stock_api.yahoo import parse_result

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_result_parses_minimal_yahoo_chart_payload() -> None:
    body = json.loads((FIXTURES / "minimal-chart.json").read_text(encoding="utf-8"))

    out = parse_result(body)

    assert out["errorMessage"] is None
    assert out["currency"] == "USD"
    assert out["symbol"] == "AAPL"
    assert out["lastPrice"] == 198.5
    assert out["points"] == [
        {"timestamp": 1700000000, "close": 198.1, "volume": 1000000},
        {"timestamp": 1700086400, "close": 198.5, "volume": 1100000},
    ]


def test_parse_result_returns_error_for_invalid_json_shape() -> None:
    out = parse_result(None)

    assert out["errorMessage"] == "Invalid JSON"
    assert out["points"] == []


def test_parse_result_returns_chart_error_description() -> None:
    out = parse_result({"chart": {"error": {"description": "Invalid symbol"}}})

    assert out["errorMessage"] == "Invalid symbol"
    assert out["points"] == []
