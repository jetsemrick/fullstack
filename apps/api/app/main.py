"""FastAPI entry point for the Stock Visualizer backend."""

from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .yahoo import fetch_major_index_quotes, fetch_yahoo_chart

DEFAULT_TICKER = "AAPL"
REPORT_BUG_MAX_LEN = 4000
TICKER_RE = re.compile(r"^[A-Za-z0-9._^=-]{1,32}$")
ALLOWED_RANGES = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
ALLOWED_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}

app = FastAPI(title="Stock Visualizer API", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


def error_body(error: str, code: str, details: str | None = None) -> dict[str, str]:
    body = {"error": error, "code": code}
    if details is not None:
        body["details"] = details
    return body


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/prices")
async def prices(request: Request) -> JSONResponse:
    raw_ticker = request.query_params.get("ticker")
    ticker = (raw_ticker.strip() if raw_ticker and raw_ticker.strip() else DEFAULT_TICKER).upper()
    if not TICKER_RE.fullmatch(ticker):
        return JSONResponse(error_body("Invalid ticker format", "VALIDATION"), status_code=400)

    chart_range = request.query_params.get("range")
    interval = request.query_params.get("interval")
    if chart_range is not None and chart_range not in ALLOWED_RANGES:
        return JSONResponse(error_body("Invalid range parameter", "VALIDATION"), status_code=400)
    if interval is not None and interval not in ALLOWED_INTERVALS:
        return JSONResponse(error_body("Invalid interval parameter", "VALIDATION"), status_code=400)

    try:
        yahoo = await fetch_yahoo_chart(
            ticker, chart_range=chart_range, interval=interval
        )
    except Exception:
        return JSONResponse(error_body("Failed to load prices", "INTERNAL"), status_code=500)
    if yahoo.error_message:
        code = "UPSTREAM" if yahoo.upstream_failure else "NOT_FOUND"
        status = 502 if yahoo.upstream_failure else 404
        return JSONResponse(error_body(yahoo.error_message, code), status_code=status)
    return JSONResponse(
        {
            "ticker": yahoo.symbol or ticker,
            "currency": yahoo.currency,
            "lastPrice": yahoo.last_price,
            "series": yahoo.points,
        }
    )


@app.get("/api/market-context")
async def market_context() -> JSONResponse:
    try:
        yahoo = await fetch_major_index_quotes()
    except Exception:
        return JSONResponse(
            error_body("Failed to load market context", "INTERNAL"), status_code=500
        )
    if yahoo.error_message or not yahoo.indexes:
        return JSONResponse(
            error_body(yahoo.error_message or "No benchmark quotes", "UPSTREAM"),
            status_code=502,
        )
    return JSONResponse(
        {"marketState": yahoo.market_state, "indexes": yahoo.indexes}
    )


@app.post("/api/report-bug")
async def report_bug(request: Request) -> JSONResponse:
    try:
        raw: Any = await request.json()
    except Exception:
        return JSONResponse(error_body("Invalid JSON body", "VALIDATION"), status_code=400)
    if not isinstance(raw, dict):
        return JSONResponse(error_body("Body must be an object", "VALIDATION"), status_code=400)
    message_raw = raw.get("message")
    if not isinstance(message_raw, str):
        return JSONResponse(error_body("message must be a string", "VALIDATION"), status_code=400)
    message = message_raw.strip()
    if not message:
        return JSONResponse(error_body("message is required", "VALIDATION"), status_code=400)
    if len(message) > REPORT_BUG_MAX_LEN:
        return JSONResponse(
            error_body(
                f"message must be at most {REPORT_BUG_MAX_LEN} characters",
                "VALIDATION",
            ),
            status_code=400,
        )
    return JSONResponse(
        error_body(
            "Report bug is unavailable in the Python API",
            "CONFIG",
            "The Cursor SDK integration remains TypeScript-only.",
        ),
        status_code=503,
    )
