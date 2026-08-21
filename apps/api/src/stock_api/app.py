from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response

from stock_api.constants import (
    ALLOWED_INTERVAL,
    ALLOWED_RANGE,
    DEFAULT_TICKER,
    TICKER_RE,
)
from stock_api.env import load_root_env
from stock_api.report_bug import AgentError, run_report_bug_agent, validate_report_bug_body
from stock_api.yahoo import fetch_yahoo_chart
from stock_api.yahoo_quote import fetch_major_index_quotes

load_root_env()

_TICKER_RE = re.compile(TICKER_RE)


def cors_origin() -> str:
    return os.environ.get("CORS_ORIGIN") or "http://localhost:5173"


def cors_headers() -> dict[str, str]:
    return {
        "access-control-allow-origin": cors_origin(),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
    }


def json_response(body: object, status: int) -> JSONResponse:
    return JSONResponse(
        content=body,
        status_code=status,
        headers={
            **cors_headers(),
            "content-type": "application/json; charset=utf-8",
        },
    )


def err_body(message: str, code: str, details: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": message, "code": code}
    if details is not None:
        body["details"] = details
    return body


def normalize_ticker(raw: str | None) -> str:
    if raw is None or not raw.strip():
        return DEFAULT_TICKER
    return raw.strip().upper()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    load_root_env()
    port = os.environ.get("PORT") or "3001"
    has_key = bool((os.environ.get("CURSOR_API_KEY") or "").strip())
    print(
        f"[api] listening on http://localhost:{port} "
        f"(CORS: {cors_origin()}; CURSOR_API_KEY: {'set' if has_key else 'missing'})"
    )
    yield


app = FastAPI(title="Stock Visualizer API", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def cors_and_options(request: Request, call_next):  # type: ignore[no-untyped-def]
    if request.method == "OPTIONS":
        return Response(status_code=204, headers=cors_headers())
    response = await call_next(request)
    for key, value in cors_headers().items():
        response.headers[key] = value
    return response


@app.get("/api/health")
async def health() -> JSONResponse:
    return json_response({"ok": True}, 200)


@app.get("/api/prices")
async def prices(
    ticker: str | None = None,
    range: str | None = Query(default=None),
    interval: str | None = None,
) -> JSONResponse:
    normalized = normalize_ticker(ticker)
    if not _TICKER_RE.fullmatch(normalized):
        return json_response(err_body("Invalid ticker format", "VALIDATION"), 400)
    if range is not None and range not in ALLOWED_RANGE:
        return json_response(err_body("Invalid range parameter", "VALIDATION"), 400)
    if interval is not None and interval not in ALLOWED_INTERVAL:
        return json_response(err_body("Invalid interval parameter", "VALIDATION"), 400)
    try:
        yahoo = await fetch_yahoo_chart(normalized, {"range": range, "interval": interval})
        if yahoo.error_message:
            is_no_data = len(yahoo.points) == 0
            return json_response(
                err_body(yahoo.error_message, "NOT_FOUND" if is_no_data else "UPSTREAM"),
                404 if is_no_data else 502,
            )
        body = {
            "ticker": yahoo.symbol or normalized,
            "currency": yahoo.currency,
            "lastPrice": yahoo.last_price,
            "series": yahoo.points,
        }
        return json_response(body, 200)
    except Exception as exc:
        msg = str(exc) if str(exc) else "Unknown error"
        return json_response(err_body("Failed to load prices", "INTERNAL", msg), 500)


@app.get("/api/market-context")
async def market_context() -> JSONResponse:
    try:
        yahoo = await fetch_major_index_quotes()
        if yahoo.error_message or not yahoo.indexes:
            return json_response(
                err_body(yahoo.error_message or "No benchmark quotes", "UPSTREAM"),
                502,
            )
        return json_response(
            {"marketState": yahoo.market_state, "indexes": yahoo.indexes},
            200,
        )
    except Exception as exc:
        msg = str(exc) if str(exc) else "Unknown error"
        return json_response(err_body("Failed to load market context", "INTERNAL", msg), 500)


@app.post("/api/report-bug")
async def report_bug(request: Request) -> JSONResponse:
    try:
        raw: object = await request.json()
    except Exception:
        return json_response(err_body("Invalid JSON body", "VALIDATION"), 400)
    checked = validate_report_bug_body(raw)
    if isinstance(checked, tuple):
        return json_response(err_body(checked[0], checked[1]), 400)
    try:
        body = run_report_bug_agent(checked)
        if body.get("status") == "error":
            return json_response(body, 502)
        return json_response(body, 200)
    except AgentError as exc:
        code = exc.code if exc.code in {"CONFIG", "UPSTREAM", "INTERNAL"} else "INTERNAL"
        status = 503 if code == "CONFIG" else 502 if code == "UPSTREAM" else 500
        message = (
            "Cursor API key not configured" if code == "CONFIG" else "Failed to run edit agent"
        )
        return json_response(err_body(message, code, str(exc)), status)
    except Exception as exc:
        msg = str(exc) if str(exc) else "Unknown error"
        return json_response(err_body("Failed to run edit agent", "INTERNAL", msg), 500)


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
async def not_found(full_path: str) -> Response:
    return Response(content="Not found", status_code=404, headers=cors_headers())
