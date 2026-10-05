import { Hono } from "hono";
import { z } from "zod";
import { parseKey } from "@/catalog";
import type { Content } from "@/db";
import type { Env, RestContext } from "./context";
import { fail, json, noContent } from "./http";
import { contentByKey, keyExists, variantsOf } from "./contents";
import { deleteProgress, getProgress, isResumable, setFinished, setProgress } from "./progress";
import { qualityBadgeOf, versionsOf, versionsSummary } from "./versions";
import { currentEpisode, type EpisodeRow, episodeWire, episodesOf } from "./episodes";
import { badgesOf, castOf, episodeCode, runtimeText } from "./cards";
import { suggestions } from "./related";
import { addWatchTime } from "./watch-time";
import { playbackMarkers } from "./markers";
import type { NextEpisode, Playback, Version } from "./types";

/**
 * `/playback/{id}`: versions, resume point and next episode (a series: of the episode it resumes on);
 * `GET …/suggestions`: « Si vous avez aimé… » and what follows a movie or a series; `PUT …/progress`: the position watched;
 * `DELETE …/progress`: out of « Reprendre »; `PUT …/watched`: seen or not, a whole season on a series id;
 * `POST …/watch-time`: seconds of a channel played, for « Chaînes les plus regardées »;
 * `POST …/markers`: the intro and the end credits of the file the app opened.
 */
export const playbackRoutes = new Hono<Env>();

playbackRoutes.get("/:id/suggestions", async (c) => {
  const s = await suggestions(c.get("ctx"), c.req.param("id"));
  return s ? json(s) : fail("not_found", "Contenu introuvable");
});

playbackRoutes.get("/:id", async (c) => {
  const key = c.req.param("id");
  if (!parseKey(key)) return fail("not_found", "Contenu introuvable");
  const p = await playback(c.get("ctx"), key);
  return p ? json(p) : fail("not_found", "Contenu introuvable");
});

// Parsed by hand rather than with zValidator("json"): a malformed body must still answer in the
// contract's `{ error: { code, message } }` shape, which the validator's own 400 does not.
const progressBody = z.object({ position: z.number().min(0).finite(), duration: z.number().min(0).finite() });
playbackRoutes.put("/:id/progress", async (c) => {
  const key = c.req.param("id");
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live") return fail("not_found", "Contenu introuvable");
  const body = progressBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "position et duration (secondes, ≥ 0) attendus");
  if (!(await keyExists(c.get("ctx"), key))) return fail("not_found", "Contenu introuvable");
  await setProgress(key, body.data.position, body.data.duration);
  return noContent();
});

/** Out of « Reprendre »: the resume point is forgotten, as if never started. */
playbackRoutes.delete("/:id/progress", async (c) => {
  const key = c.req.param("id");
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live" || !(await keyExists(c.get("ctx"), key))) return fail("not_found", "Contenu introuvable");
  await deleteProgress(key);
  return noContent();
});

const watchedBody = z.object({ watched: z.boolean(), season: z.number().int().min(0).optional() });
/** A movie or an episode, or on a series id every episode of `season` (of the series without it). */
playbackRoutes.put("/:id/watched", async (c) => {
  const key = c.req.param("id");
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live") return fail("not_found", "Contenu introuvable");
  const body = watchedBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "watched (booléen) attendu, season (entier) en option");
  const ctx = c.get("ctx");
  if (parsed.kind === "series" && parsed.episode === undefined) {
    const content = await contentByKey(ctx, key);
    if (!content) return fail("not_found", "Contenu introuvable");
    const episodes = (await episodesOf(ctx, content)).episodes.filter(
      (e) => body.data.season === undefined || e.season === body.data.season,
    );
    if (!episodes.length) return fail("not_found", "Saison introuvable");
    await setFinished(
      episodes.map((e) => e.key),
      body.data.watched,
    );
    return noContent();
  }
  if (!(await keyExists(ctx, key))) return fail("not_found", "Contenu introuvable");
  await setFinished(key, body.data.watched);
  return noContent();
});

const watchTimeBody = z.object({ seconds: z.number().min(0).finite() });
/** A channel only: what the app played since its last report, added to today's total. */
playbackRoutes.post("/:id/watch-time", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const body = watchTimeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "seconds (≥ 0) attendu");
  if (!(await keyExists(c.get("ctx"), key))) return fail("not_found", "Chaîne introuvable");
  await addWatchTime(key, body.data.seconds);
  return noContent();
});

const markersBody = z.object({
  duration: z.number().positive().finite(),
  chapters: z.array(z.object({ name: z.string().max(200), start: z.number().min(0).finite(), end: z.number().min(0).finite() })).max(500),
});
/** A movie or an episode: what the app read in the file it opened, answered with its markers. */
playbackRoutes.post("/:id/markers", async (c) => {
  const key = c.req.param("id");
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live" || (parsed.kind === "series" && parsed.episode === undefined))
    return fail("not_found", "Contenu introuvable");
  const body = markersBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "duration (secondes, > 0) et chapters (name, start, end) attendus");
  if (!(await keyExists(c.get("ctx"), key))) return fail("not_found", "Contenu introuvable");
  return json(await playbackMarkers(key, body.data));
});

export async function playback(ctx: RestContext, key: string): Promise<Playback | null> {
  const parsed = parseKey(key);
  if (!parsed) return null;
  if (parsed.episode !== undefined) {
    const content = await contentByKey(ctx, parsed.seriesKey);
    if (content?.kind !== "series") return null;
    const { episodes } = await episodesOf(ctx, content);
    const idx = episodes.findIndex((e) => e.key === key);
    return idx === -1 ? null : episodePlayback(ctx, content, episodes, idx);
  }
  const content = await contentByKey(ctx, key);
  if (!content) return null;
  if (content.kind === "series") {
    const { episodes } = await episodesOf(ctx, content);
    const e = currentEpisode(episodes, await getProgress(episodes.map((e) => e.key))) ?? episodes[0];
    return e ? episodePlayback(ctx, content, episodes, episodes.indexOf(e)) : null;
  }
  const versions = versionsOf(ctx, (await variantsOf(ctx, content)).playables);
  if (content.kind === "live") return { versions, resume_at: null, duration: null, next: null, cast: [] };
  const p = (await getProgress([key])).get(key);
  return {
    versions,
    resume_at: isResumable(p) ? p.position : null,
    duration: p?.duration || (content.runtime ? content.runtime * 60 : null),
    next: null,
    cast: castOf(ctx, content),
  };
}

/** What plays `episodes[idx]` of `series`, with the one that follows. */
async function episodePlayback(ctx: RestContext, series: Content, episodes: EpisodeRow[], idx: number): Promise<Playback> {
  const e = episodes[idx],
    next = episodes[idx + 1];
  const p = (await getProgress([e.key])).get(e.key);
  const nextVersions = next ? versionsOf(ctx, next.playables, false) : [];
  return {
    // Named for whoever plays it from its id alone (« Reprendre »): the app titles the player with it.
    episode: { id: e.key, season: e.season, number: e.number, title: e.title },
    versions: versionsOf(ctx, e.playables),
    resume_at: isResumable(p) ? p.position : null,
    duration: p?.duration || (e.runtime ? e.runtime * 60 : null),
    next: next ? nextEpisodeOf(ctx, series, next, nextVersions) : null,
    cast: castOf(ctx, series),
  };
}

/** The episode that follows, and what « À suivre » draws of it. */
function nextEpisodeOf(ctx: RestContext, series: Content, next: EpisodeRow, versions: Version[]): NextEpisode {
  const summary = versionsSummary(versions);
  const wire = episodeWire(ctx, next);
  return {
    id: next.key,
    title: next.title,
    season: next.season,
    number: next.number,
    runtime: next.runtime,
    ...summary,
    still: wire.still,
    item: {
      ...wire.item,
      facts: [series.title, episodeCode(next.season, next.number), next.runtime ? runtimeText(next.runtime) : null]
        .filter((t) => t !== null)
        .join(" · "),
      quality: qualityBadgeOf(summary),
      badges: badgesOf(qualityBadgeOf(summary), summary.languages),
      progress: null,
      watched: false,
      caption: null,
      overview: next.overview,
    },
    heading: "ÉPISODE SUIVANT",
  };
}
