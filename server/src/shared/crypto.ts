import { createHash, createHmac } from "node:crypto";
import { env } from "./env";

export function sha256(s: string) {
  return createHash("sha256").update(s).digest();
}

/** The key that lets a TMDB image be downloaded: only the URLs this server writes carry it, not any caller's guess. */
export function imageKey(size: string, file: string): string {
  return createHmac("sha256", env.sessionSecret).update(`img:${size}/${file}`).digest("base64url").slice(0, 16);
}

/** `/img/{size}/{file}?k=…` for a TMDB path (`/abc.jpg`): the URL the server hands out, which may trigger a download. */
export function signedImagePath(size: string, tmdbPath: string): string {
  const file = tmdbPath.replace(/^\//, "");
  return `/img/${size}/${file}?k=${imageKey(size, file)}`;
}
