import type { ApiError } from "./types";

/** JSON answers of `/player`, never cached; errors in the contract's `{ error: { code, message } }` shape. */

const STATUS: Record<ApiError["error"]["code"], 400 | 401 | 404 | 429 | 502 | 503> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  too_many_requests: 429,
  upstream: 502,
  locked: 503,
};
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export const fail = (code: ApiError["error"]["code"], message: string) =>
  new Response(JSON.stringify({ error: { code, message } } satisfies ApiError), { status: STATUS[code], headers });
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
export const noContent = () => new Response(null, { status: 204 });
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

/** Thrown by a resource for a malformed query; the router turns it into a 400. */
export class BadRequest extends Error {}
