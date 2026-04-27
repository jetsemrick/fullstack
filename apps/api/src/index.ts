import { handleApiRequest } from "./routes";

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  port: PORT,
  fetch: handleApiRequest,
});

const cors = process.env.CORS_ORIGIN ?? "http://localhost:5173";
console.log(`[api] listening on http://localhost:${PORT} (CORS: ${cors})`);
