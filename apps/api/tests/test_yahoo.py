import json
from pathlib import Path

from app.yahoo import parse_chart_response, parse_quote_response

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


def test_parse_chart_response() -> None:
    result = parse_chart_response(load_fixture("minimal-chart.json"))
    assert result.error_message is None
    assert result.currency == "USD"
    assert result.symbol == "AAPL"
    assert result.last_price == 198.5
    assert result.points == [
        {"timestamp": 1700000000, "close": 198.1, "volume": 1000000},
        {"timestamp": 1700086400, "close": 198.5, "volume": 1100000},
    ]


def test_parse_chart_response_handles_untrusted_shapes() -> None:
    assert parse_chart_response(None).error_message == "Invalid JSON"
    assert (
        parse_chart_response({"chart": {"error": {"description": "Invalid symbol"}}})
        .error_message
        == "Invalid symbol"
    )
    malformed = {
        "chart": {
            "error": None,
            "result": [
                {
                    "meta": {"symbol": "AAPL"},
                    "timestamp": [1, 2],
                    "indicators": {"quote": [{"close": [10]}]},
                }
            ],
        }
    }
    assert parse_chart_response(malformed).error_message == "Malformed quote data"


def test_parse_quote_response_orders_major_indexes() -> None:
    result = parse_quote_response(load_fixture("minimal-quote.json"))
    assert result.error_message is None
    assert result.market_state == "REGULAR"
    assert [index["symbol"] for index in result.indexes] == [
        "^GSPC",
        "^DJI",
        "^IXIC",
    ]


def test_parse_quote_response_handles_invalid_shape() -> None:
    result = parse_quote_response({"quoteResponse": {"result": "invalid"}})
    assert result.error_message == "Malformed quote results"
    assert result.indexes == []
