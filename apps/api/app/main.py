"""FastAPI app — same HTTP contracts as the former Bun API."""

from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from .constants import (
    ALLOWED_INTERVAL,
    ALLOWED_RANGE,
    DEFAULT_TICKER,
    REPORT_BUG_MAX_LEN,
    TICKER_RE,
)
from .report_bug import ReportBugError, run_report_bug_agent
from .yahoo import fetch_yahoo_chart
from .yahoo_quote import fetch_major_index_quotes

# apps/api/app/main.py → monorepo root is three levels up
REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT_ENV_PATH = REPO_ROOT / ".env"

# Load root .env without overriding already-set environment variables.
if ROOT_ENV_PATH.is_file():
    load_dotenv(ROOT_ENV_PATH, override=False)

CORS_ORIGIN = os.environ.get("CORS_ORIGIN") or "http://localhost:5173"
_TICKER_PATTERN = re.compile(TICKER_RE)


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
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=30.0)
    port = os.environ.get("PORT") or "3001"
    has_cursor_key = bool((os.environ.get("CURSOR_API_KEY") or "").strip())
    print(
        f"[api] listening on http://localhost:{port} "
        f"(CORS: {CORS_ORIGIN}; CURSOR_API_KEY: {'set' if has_cursor_key else 'missing'})"
    )
    yield
    await app.state.http.aclose()


app = FastAPI(title="Stock Visualizer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/prices")
async def prices(
    request: Request,
    ticker: str | None = None,
    range: str | None = None,
    interval: str | None = None,
) -> JSONResponse:
    normalized = normalize_ticker(ticker)
    if not _TICKER_PATTERN.match(normalized):
        return JSONResponse(err_body("Invalid ticker format", "VALIDATION"), status_code=400)
    if range is not None and range not in ALLOWED_RANGE:
        return JSONResponse(err_body("Invalid range parameter", "VALIDATION"), status_code=400)
    if interval is not None and interval not in ALLOWED_INTERVAL:
        return JSONResponse(err_body("Invalid interval parameter", "VALIDATION"), status_code=400)
    try:
        client: httpx.AsyncClient = request.app.state.http
        yahoo = await fetch_yahoo_chart(
            normalized,
            range_=range,
            interval=interval,
            client=client,
        )
        if yahoo["errorMessage"]:
            is_no_data = len(yahoo["points"]) == 0
            return JSONResponse(
                err_body(yahoo["errorMessage"], "NOT_FOUND" if is_no_data else "UPSTREAM"),
                status_code=404 if is_no_data else 502,
            )
        body = {
            "ticker": yahoo["symbol"] or normalized,
            "currency": yahoo["currency"],
            "lastPrice": yahoo["lastPrice"],
            "series": yahoo["points"],
        }
        return JSONResponse(body, status_code=200)
    except Exception as e:
        return JSONResponse(
            err_body("Failed to load prices", "INTERNAL", str(e)),
            status_code=500,
        )


@app.get("/api/market-context")
async def market_context(request: Request) -> JSONResponse:
    try:
        client: httpx.AsyncClient = request.app.state.http
        y = await fetch_major_index_quotes(client=client)
        if y["errorMessage"] or not y["indexes"]:
            return JSONResponse(
                err_body(y["errorMessage"] or "No benchmark quotes", "UPSTREAM"),
                status_code=502,
            )
        body = {"marketState": y["marketState"], "indexes": y["indexes"]}
        return JSONResponse(body, status_code=200)
    except Exception as e:
        return JSONResponse(
            err_body("Failed to load market context", "INTERNAL", str(e)),
            status_code=500,
        )


@app.post("/api/report-bug")
async def report_bug(request: Request) -> JSONResponse:
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(err_body("Invalid JSON body", "VALIDATION"), status_code=400)
    if not isinstance(raw, dict):
        return JSONResponse(err_body("Body must be an object", "VALIDATION"), status_code=400)
    message_raw = raw.get("message")
    if not isinstance(message_raw, str):
        return JSONResponse(err_body("message must be a string", "VALIDATION"), status_code=400)
    message = message_raw.strip()
    if not message:
        return JSONResponse(err_body("message is required", "VALIDATION"), status_code=400)
    if len(message) > REPORT_BUG_MAX_LEN:
        return JSONResponse(
            err_body(f"message must be at most {REPORT_BUG_MAX_LEN} characters", "VALIDATION"),
            status_code=400,
        )
    try:
        body = await run_report_bug_agent(message)
        if body.get("status") == "error":
            return JSONResponse(body, status_code=502)
        return JSONResponse(body, status_code=200)
    except ReportBugError as e:
        status = 503 if e.code == "CONFIG" else 502 if e.code == "UPSTREAM" else 500
        msg = (
            "Cursor API key not configured"
            if e.code == "CONFIG"
            else "Failed to run edit agent"
        )
        return JSONResponse(err_body(msg, e.code, str(e)), status_code=status)
    except Exception as e:
        return JSONResponse(
            err_body("Failed to run edit agent", "INTERNAL", str(e)),
            status_code=500,
        )


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def not_found(full_path: str) -> PlainTextResponse:
    return PlainTextResponse("Not found", status_code=404)
