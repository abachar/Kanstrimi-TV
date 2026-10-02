import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/shared";
import type { RestContext } from "./context";

/**
 * `stream_url` is opaque to the app and re-read at every playback: a signed link to our
 * `/player/stream/{source}` redirect, tied to the device and valid a quarter of an hour: its 302
 * hands out the provider's credentials (`Location`), so a link that leaks must die soon. The app asks
 * `/playback` again for a fresh one after a failure or a long pause. The device token never appears
 * in a URL (the player cannot send headers, logs must stay clean).
 */
export const STREAM_TTL_MS = 15 * 60 * 1000;
const sign = (src: string, code: string, exp: number) =>
  createHmac("sha256", env.sessionSecret).update(`${src}|${code}|${exp}`).digest("base64url");

export function streamUrl(ctx: RestContext, sourceId: string): string {
  // The admin reads the catalogue without a device: it never plays, so no link to sign.
  if (!ctx.device) return "";
  const exp = Math.floor((Date.now() + STREAM_TTL_MS) / 1000);
  return `${ctx.baseUrl}/player/stream/${sourceId}?d=${ctx.device.code}&e=${exp}&s=${sign(sourceId, ctx.device.code, exp)}`;
}
export function verifyStreamSignature(sourceId: string, code: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(sourceId, code, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `src-i…` = an item (movie or channel), `src-e…` = an episode source; base36 of our own ids. */
export const sourceId = (kind: "item" | "episode", id: number) => `src-${kind === "item" ? "i" : "e"}${id.toString(36)}`;
export function parseSourceId(s: string): { kind: "item" | "episode"; id: number } | null {
  const m = /^src-([ie])([0-9a-z]{1,10})$/.exec(s);
  if (!m) return null;
  const id = parseInt(m[2], 36);
  return Number.isInteger(id) && id > 0 ? { kind: m[1] === "i" ? "item" : "episode", id } : null;
}
