import { Hono } from "hono";
import { z } from "zod";
import { ensureEpisodes, parseKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json, noContent } from "./http";
import { contentByKey, keyExists, variantsOf } from "./contents";
import { getProgress, isResumable, setProgress } from "./progress";
import { versionsOf, versionsSummary } from "./versions";
import { episodeWire, loadEpisodes } from "./episodes";
import type { Playback } from "./types";

/** `/playback/{id}`: versions, resume point and next episode; `PUT …/progress`: the position watched. */
export const playbackRoutes = new Hono<Env>();

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

export async function playback(ctx: RestContext, key: string): Promise<Playback | null> {
  const parsed = parseKey(key);
  if (!parsed) return null;
  if (parsed.episode !== undefined) {
    const content = await contentByKey(ctx, parsed.seriesKey);
    if (!content || content.kind !== "series") return null;
    const { items, categoryName } = await variantsOf(content);
    await ensureEpisodes(content, items, ctx.tmdbLang);
    const episodes = await loadEpisodes(content, items, categoryName);
    const idx = episodes.findIndex((e) => e.key === key);
    if (idx === -1) return null;
    const e = episodes[idx],
      next = episodes[idx + 1];
    const p = (await getProgress([key])).get(key);
    const nextVersions = next ? versionsOf(ctx, next.playables, false) : [];
    return {
      versions: versionsOf(ctx, e.playables),
      resume_at: isResumable(p) ? p.position : null,
      duration: p?.duration || (e.runtime ? e.runtime * 60 : null),
      next: next
        ? {
            id: next.key,
            title: next.title,
            season: next.season,
            number: next.number,
            runtime: next.runtime,
            ...versionsSummary(nextVersions),
            still: episodeWire(ctx, next).still,
          }
        : null,
    };
  }
  const content = await contentByKey(ctx, key);
  if (!content) return null;
  const versions = versionsOf(ctx, (await variantsOf(content)).playables);
  if (content.kind === "live") return { versions, resume_at: null, duration: null, next: null };
  if (content.kind === "series") return null;
  const p = (await getProgress([key])).get(key);
  return {
    versions,
    resume_at: isResumable(p) ? p.position : null,
    duration: p?.duration || (content.runtime ? content.runtime * 60 : null),
    next: null,
  };
}
