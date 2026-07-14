import { join } from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { ReportBugResponse } from "@stock/shared";

/** Monorepo root (Stock Visualizer) — local agent cwd. `apps/api/src` → `../../..`. */
export const REPO_ROOT = join(import.meta.dir, "../../..");
/** Root `.env` path (same depth as {@link REPO_ROOT}). */
export const ROOT_ENV_PATH = join(REPO_ROOT, ".env");

const DEFAULT_MODEL = "composer-2.5";

function buildPrompt(userMessage: string): string {
  return [
    "You are editing the Stock Visualizer monorepo (Bun workspaces: apps/web Vite+React, apps/api Bun HTTP, packages/shared).",
    "The user submitted a bug report or edit request from the in-app Report bug control.",
    "Investigate and implement a minimal, focused fix or change in this repository.",
    "Do not expand scope. Prefer matching existing patterns, types, and CSS tokens.",
    "",
    "User request:",
    userMessage,
  ].join("\n");
}

/**
 * Runs a one-shot local Cursor agent against the monorepo.
 * Requires `CURSOR_API_KEY` (from process env or repo-root `.env`).
 */
export async function runReportBugAgent(userMessage: string): Promise<ReportBugResponse> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("CURSOR_API_KEY is not configured") as Error & { code: "CONFIG" };
    err.code = "CONFIG";
    throw err;
  }

  try {
    const run = await Agent.prompt(buildPrompt(userMessage), {
      apiKey,
      model: { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_MODEL },
      name: "Stock Visualizer report-bug",
      local: { cwd: REPO_ROOT },
    });

    return {
      runId: run.id,
      status: run.status,
      result: run.result,
      error: run.error?.message,
    };
  } catch (e) {
    if (e instanceof CursorAgentError) {
      const err = new Error(e.message) as Error & { code: "UPSTREAM"; retryable?: boolean };
      err.code = "UPSTREAM";
      err.retryable = e.isRetryable;
      throw err;
    }
    throw e;
  }
}
