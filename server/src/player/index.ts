import { Hono } from "hono";
import { UpstreamUnavailable } from "@/catalog";
import { TooManyRequests } from "@/devices";
import type { Env } from "./context";
import { BadRequest, fail } from "./http";
import { bearer } from "./auth";
import { deviceRoutes, pairingRoutes } from "./devices";
import { infoRoutes } from "./info";
import { homeRoutes } from "./home";
import { listRoutes } from "./lists";
import { sagaRoutes } from "./sagas";
import { peopleRoutes } from "./people";
import { topShelfRoutes } from "./top-shelf";
import { studioRoutes } from "./studios";
import { sheetRoutes } from "./sheets";
import { channelRoutes } from "./channels";
import { playbackRoutes } from "./playback";
import { searchRoutes } from "./search";
import { favoriteRoutes } from "./favorites";

/**
 * `/player`, the contract of `types.ts`, one file per resource. Bearer device token everywhere
 * but pairing (`POST /devices`, `GET /devices/{code}`). JSON snake_case, errors as
 * `{ error: { code, message } }`. The video never flows through here: `stream_url` is the provider's own URL.
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

// Without a token: pairing.
player.route("/devices", pairingRoutes);

// Everything else carries the device token.
player.use("*", bearer());
player.route("/devices", deviceRoutes);
player.route("/info", infoRoutes);
player.route("/home", homeRoutes);
// Before the sheets: `/movies/{id}` would take « sagas » or « studios » for an id.
player.route("/movies/sagas", sagaRoutes);
player.route("/movies/studios", studioRoutes("vod"));
player.route("/series/studios", studioRoutes("series"));
player.route("/movies", listRoutes("vod"));
player.route("/movies", sheetRoutes("vod"));
player.route("/series", listRoutes("series"));
player.route("/series", sheetRoutes("series"));
player.route("/channels", channelRoutes);
player.route("/playback", playbackRoutes);
player.route("/search", searchRoutes);
player.route("/favorites", favoriteRoutes);
player.route("/people", peopleRoutes);
player.route("/top-shelf", topShelfRoutes);

// What the admin reads and edits of the app's own data (favourites, positions); `player` itself never imports `admin`.
export { contextFor, type RestContext } from "./context";
export { favoriteSet, setFavorite } from "./favorites";
export { channelGroups } from "./channels";
export { catalogRows, listContents } from "./lists";
export { studiosOf } from "./studios";
export { listSagaWires, sagaSheet } from "./sagas";
export { gridCard, runtimeText } from "./cards";
export { epgIdsOf } from "./versions";
export { isShelfPair } from "./top-shelf";
export { listProgress, deleteProgress, getProgress, setFinished, setProgress, type Progress } from "./progress";
export { setSeriesWatched } from "./episodes";
export type { Card, CatalogRow, ChannelGroupWire, ChannelWire, SagaWire, StudioWire, Version } from "./types";
