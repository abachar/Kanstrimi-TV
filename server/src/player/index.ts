import { Hono } from "hono";
import { UpstreamUnavailable } from "@/catalog";
import { TooManyRequests } from "@/devices";
import type { Env } from "./context";
import { BadRequest, fail } from "./http";
import { bearer } from "./auth";
import { deviceRoutes, pairingRoutes } from "./devices";
import { streamRoutes } from "./stream";
import { infoRoutes } from "./info";
import { homeRoutes } from "./home";
import { listRoutes } from "./lists";
import { sheetRoutes } from "./sheets";
import { channelRoutes } from "./channels";
import { playbackRoutes } from "./playback";
import { searchRoutes } from "./search";
import { favoriteRoutes } from "./favorites";

/**
 * `/player`, the contract of `types.ts`, one file per resource. Bearer device token everywhere
 * but `/devices` (pairing) and `/stream` (signed URLs for the player). JSON snake_case, errors
 * as `{ error: { code, message } }`. The video never flows through here: `/stream` answers 302.
 */
export const player = new Hono<Env>();

player.onError((err, c) => {
  if (err instanceof BadRequest) return fail("bad_request", err.message);
  if (err instanceof UpstreamUnavailable) return fail("upstream", err.message);
  if (err instanceof TooManyRequests) return fail("too_many_requests", err.message);
  console.error("[api]", err);
  return c.json({ error: { code: "internal", message: "Erreur interne" } }, 500);
});
player.notFound(() => fail("not_found", "Route inconnue"));

// Without a token: pairing and the signed stream links.
player.route("/devices", pairingRoutes);
player.route("/stream", streamRoutes);

// Everything else carries the device token.
player.use("*", bearer());
player.route("/devices", deviceRoutes);
player.route("/info", infoRoutes);
player.route("/home", homeRoutes);
player.route("/movies", listRoutes("vod"));
player.route("/movies", sheetRoutes("vod"));
player.route("/series", listRoutes("series"));
player.route("/series", sheetRoutes("series"));
player.route("/channels", channelRoutes);
player.route("/playback", playbackRoutes);
player.route("/search", searchRoutes);
player.route("/favorites", favoriteRoutes);

// What the admin reads and edits of the app's own data (favourites, positions); `player` itself never imports `admin`.
export { contextFor, type RestContext } from "./context";
export { setFavorite } from "./favorites";
export { channelGroups } from "./channels";
export { gridCard } from "./cards";
export { listProgress, deleteProgress, setFinished, setProgress, type Progress } from "./progress";
export type { Card, ChannelGroupWire, ChannelWire, Version } from "./types";
