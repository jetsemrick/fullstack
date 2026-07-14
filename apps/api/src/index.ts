import { existsSync, readFileSync } from "node:fs";
import { ROOT_ENV_PATH } from "./cursor-agent";
import { handleApiRequest } from "./routes";

/**
 * Bun only auto-loads `.env` from cwd. API scripts use `--cwd apps/api`, so load
 * the monorepo-root `.env` without overriding vars already set in the environment.
 */
function loadRootEnvFile(): void {
  if (!existsSync(ROOT_ENV_PATH)) return;
  const text = readFileSync(ROOT_ENV_PATH, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRootEnvFile();

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  port: PORT,
  fetch: handleApiRequest,
});

const cors = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const hasCursorKey = Boolean(process.env.CURSOR_API_KEY?.trim());
console.log(`[api] listening on http://localhost:${PORT} (CORS: ${cors}; CURSOR_API_KEY: ${hasCursorKey ? "set" : "missing"})`);
