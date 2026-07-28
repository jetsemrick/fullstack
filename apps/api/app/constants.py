"""Shared API constants — mirror packages/shared for the Python service."""

DEFAULT_RANGE = "max"
DEFAULT_INTERVAL = "1d"
DEFAULT_TICKER = "AAPL"
MAJOR_INDEX_SYMBOLS = ("^GSPC", "^DJI", "^IXIC")

ALLOWED_RANGE = frozenset(
    {
        "1d",
        "5d",
        "1mo",
        "3mo",
        "6mo",
        "1y",
        "2y",
        "5y",
        "10y",
        "ytd",
        "max",
    }
)
ALLOWED_INTERVAL = frozenset(
    {
        "1m",
        "2m",
        "5m",
        "15m",
        "30m",
        "60m",
        "90m",
        "1h",
        "1d",
        "5d",
        "1wk",
        "1mo",
        "3mo",
    }
)

REPORT_BUG_MAX_LEN = 4000
TICKER_RE = r"^[A-Za-z0-9._^=-]{1,32}$"
