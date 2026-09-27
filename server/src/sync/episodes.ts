import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db, schema, type Content, type Item } from "@/db";
import { XtreamClient, XtreamError } from "./reader/xtream";
import { getTmdbClient } from "./enrich/tmdb/enrich";
import { episodeKey } from "./grouping/naming";

/** Provider data is re-read after 12 h; TMDB season data after 30 days. */
const INFO_TTL_MS = 12 * 3600 * 1000;
const SEASON_TTL_MS = 30 * 24 * 3600 * 1000;

export class UpstreamUnavailable extends Error { constructor() { super("Le fournisseur n'a pas répondu"); } }

type UpstreamEpisode = { id?: unknown; episode_num?: unknown; season?: unknown; title?: unknown; container_extension?: unknown; info?: Record<string, unknown> };
type UpstreamInfo = {
  episodes?: Record<string, UpstreamEpisode[]> | UpstreamEpisode[][];
  seasons?: { season_number?: number; name?: string; air_date?: string; episodes?: TmdbEpisode[] }[];
};
type TmdbEpisode = { episode_number: number; season_number?: number; name?: string; overview?: string; still_path?: string | null; runtime?: number | null; air_date?: string | null };
type Meta = { title: string | null; overview: string | null; runtime: number | null; stillPath: string | null; airDate: string | null };

/** get_series_info through the 12 h cache; the cache is the fallback when the provider is down or not configured. */
async function upstreamInfo(client: XtreamClient | null, xtreamId: string): Promise<UpstreamInfo> {
  const [cached] = await db.select().from(schema.infoCache).where(and(eq(schema.infoCache.kind, "series"), eq(schema.infoCache.xtreamId, xtreamId)));
  if (cached && Date.now() - cached.fetchedAt.getTime() < INFO_TTL_MS) return cached.data as UpstreamInfo;
  if (!client) return (cached?.data as UpstreamInfo) ?? {};
  try {
    const data = await client.seriesInfo(xtreamId);
    await db.insert(schema.infoCache).values({ kind: "series", xtreamId, data })
      .onConflictDoUpdate({ target: [schema.infoCache.kind, schema.infoCache.xtreamId], set: { data, fetchedAt: new Date() } });
    return data as UpstreamInfo;
  } catch (e) {
    if (cached) return cached.data as UpstreamInfo;
    if (e instanceof XtreamError) return {};
    throw new UpstreamUnavailable();
  }
}

/** TMDB season document, cached under (`tv_season`, show id, `<lang>#s<n>`). */
async function tmdbSeason(tmdbId: number, season: number, lang: string): Promise<TmdbEpisode[] | null> {
  const key = `${lang}#s${season}`;
  const [cached] = await db.select().from(schema.tmdbCache).where(and(eq(schema.tmdbCache.mediaType, "tv_season"), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, key)));
  if (cached && Date.now() - cached.fetchedAt.getTime() < SEASON_TTL_MS) return (cached.data.episodes as TmdbEpisode[]) ?? null;
  const client = await getTmdbClient();
  if (!client) return (cached?.data.episodes as TmdbEpisode[]) ?? null;
  try {
    const data = await client.tvSeason(tmdbId, season);
    await db.insert(schema.tmdbCache).values({ mediaType: "tv_season", tmdbId, lang: key, data: data as Record<string, unknown> })
      .onConflictDoUpdate({ target: [schema.tmdbCache.mediaType, schema.tmdbCache.tmdbId, schema.tmdbCache.lang], set: { data: data as Record<string, unknown>, fetchedAt: new Date() } });
    return (data.episodes as TmdbEpisode[]) ?? null;
  } catch { return (cached?.data.episodes as TmdbEpisode[]) ?? null; }
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const dateOf = (v: unknown): string | null => {
  const s = typeof v === "string" ? v : (v as { date?: string } | null)?.date;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? "");
  return m ? m[1] : null;
};
/** "|FR| Ghosts | 2019 01x01 - L'héritage (MULTI)" → "L'héritage" */
function titleFromProvider(title: unknown): string | null {
  const s = String(title ?? "");
  const m = /\d{1,2}x\d{1,3}\s*[-–:]\s*(.+?)\s*(?:\([^)]*\))?\s*$/.exec(s);
  return m ? m[1].trim() || null : null;
}

/**
 * Rebuild the merged episode tree of a series from its variants when it is stale.
 * Episodes are merged by (season, number); each keeps one source per variant that has it.
 * Titles, stills and runtimes come from TMDB when the series is matched, else from the
 * provider's own TMDB-like `seasons[].episodes[]`, else from the provider episode title.
 */
export async function ensureEpisodes(content: Content, variants: Item[], client: XtreamClient | null, tmdbLang: string, force = false) {
  const [fresh] = await db.select({ at: sql<Date | null>`max(${schema.episodes.updatedAt})` }).from(schema.episodes).where(eq(schema.episodes.contentId, content.id));
  const [{ n: sources }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.episodeSources)
    .innerJoin(schema.episodes, eq(schema.episodes.id, schema.episodeSources.episodeId)).where(eq(schema.episodes.contentId, content.id));
  if (!force && fresh.at && sources > 0 && Date.now() - new Date(fresh.at).getTime() < INFO_TTL_MS) return;

  type Found = { season: number; number: number; sources: { itemId: number; xtreamId: string; container: string | null }[]; meta: Meta };
  const found = new Map<string, Found>();
  const providerMeta = new Map<string, Meta>();
  for (const v of variants) {
    const info = await upstreamInfo(client, v.xtreamId);
    for (const s of info.seasons ?? []) for (const e of s.episodes ?? []) {
      const season = e.season_number ?? s.season_number;
      if (season === undefined || e.episode_number === undefined) continue;
      providerMeta.set(`${season}:${e.episode_number}`, { title: e.name || null, overview: e.overview || null, runtime: e.runtime ?? null, stillPath: e.still_path ?? null, airDate: dateOf(e.air_date) });
    }
    const eps = info.episodes;
    const groups: [string | number, UpstreamEpisode[]][] = Array.isArray(eps) ? eps.map((g, i) => [i + 1, g]) : Object.entries(eps ?? {});
    for (const [seasonKey, list] of groups) for (const e of Array.isArray(list) ? list : []) {
      const season = num(e.season) ?? num(seasonKey) ?? (v.seasonHint ?? 1);
      const number = num(e.episode_num);
      const xtreamId = e.id != null ? String(e.id).trim() : "";
      if (number === null || !xtreamId) continue;
      const k = `${season}:${number}`;
      const info = e.info ?? {};
      const meta: Meta = { title: titleFromProvider(e.title), overview: (info.plot as string) || null, runtime: num(info.duration_secs) ? Math.round(Number(info.duration_secs) / 60) : null, stillPath: null, airDate: dateOf(info.releasedate) };
      const f = found.get(k) ?? { season, number, sources: [], meta };
      if (!f.sources.some((s) => s.itemId === v.id)) f.sources.push({ itemId: v.id, xtreamId, container: e.container_extension ? String(e.container_extension) : null });
      found.set(k, f);
    }
  }
  // Best metadata: TMDB season, then the provider's TMDB-like data, then the parsed title.
  if (content.tmdbId) {
    for (const season of new Set([...found.values()].map((f) => f.season))) {
      const eps = await tmdbSeason(content.tmdbId, season, tmdbLang);
      for (const e of eps ?? []) {
        const f = found.get(`${season}:${e.episode_number}`);
        if (f) f.meta = { title: e.name || f.meta.title, overview: e.overview || f.meta.overview, runtime: e.runtime ?? f.meta.runtime, stillPath: e.still_path ?? null, airDate: dateOf(e.air_date) ?? f.meta.airDate };
      }
    }
  }
  for (const [k, f] of found) {
    const p = providerMeta.get(k);
    if (p) f.meta = { title: f.meta.title ?? p.title, overview: f.meta.overview ?? p.overview, runtime: f.meta.runtime ?? p.runtime, stillPath: f.meta.stillPath ?? p.stillPath, airDate: f.meta.airDate ?? p.airDate };
  }

  const now = new Date();
  const rows = [...found.values()].map((f) => ({
    contentId: content.id, key: episodeKey(content.key, f.season, f.number), season: f.season, number: f.number,
    title: f.meta.title, overview: f.meta.overview, runtime: f.meta.runtime, stillPath: f.meta.stillPath, airDate: f.meta.airDate, updatedAt: now,
  }));
  const ids = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await db.insert(schema.episodes).values(rows.slice(i, i + 500)).onConflictDoUpdate({
      target: [schema.episodes.contentId, schema.episodes.season, schema.episodes.number],
      set: { key: sql`excluded.key`, title: sql`excluded.title`, overview: sql`excluded.overview`, runtime: sql`excluded.runtime`, stillPath: sql`excluded.still_path`, airDate: sql`excluded.air_date`, updatedAt: now },
    }).returning({ id: schema.episodes.id, season: schema.episodes.season, number: schema.episodes.number });
    for (const r of inserted) ids.set(`${r.season}:${r.number}`, r.id);
  }
  const srcRows = [...found.values()].flatMap((f) => f.sources.map((s) => ({ episodeId: ids.get(`${f.season}:${f.number}`)!, itemId: s.itemId, xtreamId: s.xtreamId, container: s.container, seenAt: now })));
  for (let i = 0; i < srcRows.length; i += 500) {
    if (!srcRows.length) break;
    await db.insert(schema.episodeSources).values(srcRows.slice(i, i + 500)).onConflictDoUpdate({
      target: [schema.episodeSources.episodeId, schema.episodeSources.itemId],
      set: { xtreamId: sql`excluded.xtream_id`, container: sql`excluded.container`, seenAt: now },
    });
  }
  // Sources the variants no longer list, then episodes left without any source.
  const epIds = [...ids.values()];
  if (epIds.length) await db.delete(schema.episodeSources).where(and(inArray(schema.episodeSources.episodeId, epIds), lt(schema.episodeSources.seenAt, now)));
  await db.delete(schema.episodes).where(and(eq(schema.episodes.contentId, content.id),
    epIds.length ? notInArray(schema.episodes.id, epIds) : sql`true`));
  await db.delete(schema.episodes).where(and(eq(schema.episodes.contentId, content.id),
    sql`not exists (select 1 from ${schema.episodeSources} s where s.episode_id = ${schema.episodes.id})`));
}
