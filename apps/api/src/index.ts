import { handleApiRequest } from "./routes";

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  port: PORT,
  fetch: handleApiRequest,
});

const cors = process.env.CORS_ORIGIN ?? "http://localhost:5173";
console.log(`[api] listening on http://localhost:${PORT} (CORS: ${cors})`);
if (process.env.USE_SEED_DATA?.trim()) {
  console.log("[api] USE_SEED_DATA enabled — serving deterministic fixtures (Yahoo skipped)");
}
