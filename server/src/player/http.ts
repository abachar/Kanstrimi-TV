import type { ApiError } from "./types";

/** JSON answers of `/player`, never cached; errors in the contract's `{ error: { code, message } }` shape. */

const STATUS: Record<ApiError["error"]["code"], 400 | 401 | 404 | 429 | 502> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  too_many_requests: 429,
  upstream: 502,
};
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export const fail = (code: ApiError["error"]["code"], message: string) =>
  new Response(JSON.stringify({ error: { code, message } } satisfies ApiError), { status: STATUS[code], headers });
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
export const noContent = () => new Response(null, { status: 204 });

/** Thrown by a resource for a malformed query; the router turns it into a 400. */
export class BadRequest extends Error {}

/** The hook of a `zValidator`: a malformed query answers the contract's 400 with the schema's own messages. */
export const badQuery = (r: { success: boolean; error?: { issues: { message: string }[] } }) => {
  if (!r.success) return fail("bad_request", (r.error?.issues ?? []).map((i) => i.message).join(" ; ") || "requête invalide");
};
