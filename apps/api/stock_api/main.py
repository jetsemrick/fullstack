from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import DEFAULT_TICKER, load_root_env_file
from .report_bug import ReportBugError, run_report_bug_agent
from .yahoo import fetch_yahoo_chart
from .yahoo_quote import fetch_major_index_quotes

load_root_env_file()

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://localhost:5173")
REPORT_BUG_MAX_LEN = 4000
TICKER_RE = re.compile(r"^[A-Za-z0-9._^=-]{1,32}$")
ALLOWED_RANGE = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
ALLOWED_INTERVAL = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}

app = FastAPI()


def cors_headers() -> dict[str, str]:
    return {
        "access-control-allow-origin": CORS_ORIGIN,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
    }


def json_response(body: Any, status: int) -> JSONResponse:
    return JSONResponse(body, status_code=status, media_type="application/json; charset=utf-8")


def err_body(message: str, code: str, details: str | None = None) -> dict[str, str]:
    body = {"error": message, "code": code}
    if details is not None:
        body["details"] = details
    return body


def normalize_ticker(raw: str | None) -> str:
    return DEFAULT_TICKER if raw is None or not raw.strip() else raw.strip().upper()


@app.middleware("http")
async def add_cors_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    response.headers.update(cors_headers())
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> Response:
    if exc.status_code == 404:
        return PlainTextResponse("Not found", status_code=404)
    return json_response(err_body(str(exc.detail), "INTERNAL"), exc.status_code)


@app.options("/{_path:path}", status_code=204)
async def options_handler() -> Response:
    return Response(status_code=204)


@app.get("/api/health")
async def health() -> JSONResponse:
    return json_response({"ok": True}, 200)


@app.get("/api/prices")
async def prices(request: Request) -> JSONResponse:
    query = request.query_params
    ticker = normalize_ticker(query.get("ticker"))
    if TICKER_RE.fullmatch(ticker) is None:
        return json_response(err_body("Invalid ticker format", "VALIDATION"), 400)

    range_value = query.get("range")
    interval = query.get("interval")
    if range_value is not None and range_value not in ALLOWED_RANGE:
        return json_response(err_body("Invalid range parameter", "VALIDATION"), 400)
    if interval is not None and interval not in ALLOWED_INTERVAL:
        return json_response(err_body("Invalid interval parameter", "VALIDATION"), 400)

    try:
        yahoo = await fetch_yahoo_chart(ticker, range_value=range_value, interval=interval)
    except Exception as exc:
        return json_response(err_body("Failed to load prices", "INTERNAL", str(exc)), 500)

    if yahoo["errorMessage"]:
        is_no_data = len(yahoo["points"]) == 0
        return json_response(
            err_body(yahoo["errorMessage"], "NOT_FOUND" if is_no_data else "UPSTREAM"),
            404 if is_no_data else 502,
        )

    return json_response(
        {
            "ticker": yahoo["symbol"] or ticker,
            "currency": yahoo["currency"],
            "lastPrice": yahoo["lastPrice"],
            "series": yahoo["points"],
        },
        200,
    )


@app.get("/api/market-context")
async def market_context() -> JSONResponse:
    try:
        yahoo = await fetch_major_index_quotes()
    except Exception as exc:
        return json_response(err_body("Failed to load market context", "INTERNAL", str(exc)), 500)

    if yahoo["errorMessage"] or not yahoo["indexes"]:
        return json_response(err_body(yahoo["errorMessage"] or "No benchmark quotes", "UPSTREAM"), 502)

    return json_response({"marketState": yahoo["marketState"], "indexes": yahoo["indexes"]}, 200)


@app.post("/api/report-bug")
async def report_bug(request: Request) -> JSONResponse:
    try:
        raw = await request.json()
    except Exception:
        return json_response(err_body("Invalid JSON body", "VALIDATION"), 400)

    if not isinstance(raw, dict):
        return json_response(err_body("Body must be an object", "VALIDATION"), 400)

    message_raw = raw.get("message")
    if not isinstance(message_raw, str):
        return json_response(err_body("message must be a string", "VALIDATION"), 400)

    message = message_raw.strip()
    if not message:
        return json_response(err_body("message is required", "VALIDATION"), 400)
    if len(message) > REPORT_BUG_MAX_LEN:
        return json_response(err_body(f"message must be at most {REPORT_BUG_MAX_LEN} characters", "VALIDATION"), 400)

    try:
        body = await run_report_bug_agent(message)
    except ReportBugError as exc:
        status = 503 if exc.code == "CONFIG" else 502 if exc.code == "UPSTREAM" else 500
        public_message = (
            "Cursor API key not configured"
            if str(exc) == "CURSOR_API_KEY is not configured"
            else "Report bug agent unavailable"
        )
        return json_response(
            err_body(public_message if exc.code == "CONFIG" else "Failed to run edit agent", exc.code, str(exc)),
            status,
        )
    except Exception as exc:
        return json_response(err_body("Failed to run edit agent", "INTERNAL", str(exc)), 500)

    if body.get("status") == "error":
        return json_response(body, 502)
    return json_response(body, 200)
