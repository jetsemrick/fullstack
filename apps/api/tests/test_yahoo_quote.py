from __future__ import annotations

import json
from pathlib import Path

from app.yahoo_quote import parse_quote_response

FIXTURES = Path(__file__).parent / "fixtures"


def test_parses_yahoo_v7_benchmark_quote_fixture() -> None:
    body = json.loads((FIXTURES / "minimal-quote.json").read_text())
    out = parse_quote_response(body)
    assert out["errorMessage"] is None
    assert out["marketState"] == "REGULAR"
    assert len(out["indexes"]) == 3
    assert out["indexes"][0]["symbol"] == "^GSPC"
    assert out["indexes"][1]["symbol"] == "^DJI"
    assert out["indexes"][2]["symbol"] == "^IXIC"
