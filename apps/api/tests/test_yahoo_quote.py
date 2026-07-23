from __future__ import annotations

import json
from pathlib import Path

from stock_api.yahoo_quote import parse_quote_response

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_quote_response_parses_yahoo_benchmark_quote_fixture() -> None:
    body = json.loads((FIXTURES / "minimal-quote.json").read_text(encoding="utf-8"))

    out = parse_quote_response(body)

    assert out["errorMessage"] is None
    assert out["marketState"] == "REGULAR"
    assert [index["symbol"] for index in out["indexes"]] == ["^GSPC", "^DJI", "^IXIC"]
