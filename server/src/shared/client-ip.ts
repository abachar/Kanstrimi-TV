/**
 * The caller's address: the first `X-Forwarded-For` hop, which Caddy sets from the connection (it
 * ignores the one a client sends); "local" without a proxy (tests, `npm run dev`).
 */
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
