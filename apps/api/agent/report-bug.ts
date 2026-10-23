/**
 * Cursor SDK bridge for `POST /api/report-bug`. The Go API validates the request, then runs this script
 * with `{ "message": string }` on stdin and reads a single JSON line from stdout: either a
 * `ReportBugResponse` or `{ errorCode, errorMessage }`.
 */
import { join } from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { ApiErrorBody, ReportBugResponse } from "@stock/shared";

/** Monorepo root — local agent cwd. `apps/api/agent` → `../../..`. */
const REPO_ROOT = join(import.meta.dir, "../../..");
const DEFAULT_MODEL = "composer-2.5";

type BridgeError = { errorCode: ApiErrorBody["code"]; errorMessage: string };

function buildPrompt(userMessage: string): string {
  return [
    "You are editing the Stock Visualizer monorepo (Bun workspaces: apps/web Vite+React, apps/api Go net/http, packages/shared).",
    "The user submitted a bug report or edit request from the in-app Report bug control.",
    "Investigate and implement a minimal, focused fix or change in this repository.",
    "Do not expand scope. Prefer matching existing patterns, types, and CSS tokens.",
    "",
    "User request:",
    userMessage,
  ].join("\n");
}

async function run(): Promise<ReportBugResponse | BridgeError> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { errorCode: "CONFIG", errorMessage: "CURSOR_API_KEY is not configured" };
  }
  let message: string;
  try {
    const input = JSON.parse(await Bun.stdin.text()) as { message?: unknown };
    if (typeof input.message !== "string" || !input.message.trim()) throw new Error("message is required");
    message = input.message;
  } catch (e) {
    return { errorCode: "INTERNAL", errorMessage: e instanceof Error ? e.message : "Invalid bridge input" };
  }
  try {
    const result = await Agent.prompt(buildPrompt(message), {
      apiKey,
      model: { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_MODEL },
      name: "Stock Visualizer report-bug",
      local: { cwd: REPO_ROOT },
    });
    return {
      runId: result.id,
      status: result.status,
      result: result.result,
      error: result.error?.message,
    };
  } catch (e) {
    if (e instanceof CursorAgentError) {
      return { errorCode: "UPSTREAM", errorMessage: e.message };
    }
    return { errorCode: "INTERNAL", errorMessage: e instanceof Error ? e.message : "Unknown error" };
  }
}

// The SDK may log to stdout; the Go side reads only the final line.
process.stdout.write(`\n${JSON.stringify(await run())}\n`);
