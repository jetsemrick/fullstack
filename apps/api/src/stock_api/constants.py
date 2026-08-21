"""Defaults mirrored from `packages/shared` (keep in sync)."""

DEFAULT_RANGE = "max"
DEFAULT_INTERVAL = "1d"
DEFAULT_TICKER = "AAPL"
MAJOR_INDEX_SYMBOLS = ("^GSPC", "^DJI", "^IXIC")

ALLOWED_RANGE = frozenset(
    {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
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

TICKER_RE = r"^[A-Za-z0-9._^=-]{1,32}$"
REPORT_BUG_MAX_LEN = 4000
USER_AGENT = "Mozilla/5.0 (compatible; StockVisualizer/1.0)"
YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
