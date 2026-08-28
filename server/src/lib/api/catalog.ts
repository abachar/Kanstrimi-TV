import { db, schema } from "@/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { ApiContext } from "./context";
import { getCachedDetails, getDetails, getTmdbClient } from "@/lib/tmdb/enrich";
import { imageUrl } from "@/lib/tmdb/images";
import type { TmdbDetails } from "@/lib/tmdb/client";
import type { Kind } from "@/lib/filters/rules";
import { XtreamError } from "@/lib/xtream/client";

const visibleCat = and(eq(schema.categories.hiddenByRule, false), eq(schema.categories.hiddenManual, false));
const visibleItem = and(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false));
const INFO_TTL_MS = 12 * 3600 * 1000;

export async function listCategories(kind: Kind) {
  const rows = await db.select().from(schema.categories).where(and(eq(schema.categories.kind, kind), visibleCat)).orderBy(asc(schema.categories.position));
  return rows.map((c) => ({ ...c.raw, category_id: c.raw.category_id ?? c.xtreamId, category_name: c.name, parent_id: c.raw.parent_id ?? c.parentId }));
}

export async function listItems(ctx: ApiContext, kind: Kind, categoryId?: string | null) {
  const where = [eq(schema.items.kind, kind), visibleItem];
  if (categoryId) where.push(eq(schema.items.categoryXtreamId, categoryId));
  const rows = await db.select().from(schema.items).where(and(...where)).orderBy(asc(schema.items.position));
  const enrich = kind !== "live";
  const lang = ctx.settings.tmdb_language || "fr-FR";
  // Preload TMDB cache for matched items in one query
  const tmdbMap = new Map<number, TmdbDetails>();
  if (enrich) {
    const ids = [...new Set(rows.filter((r) => r.tmdbId).map((r) => r.tmdbId as number))];
    for (let i = 0; i < ids.length; i += 1000) {
      const cached = await db.select().from(schema.tmdbCache).where(and(
        eq(schema.tmdbCache.mediaType, kind === "vod" ? "movie" : "tv"), eq(schema.tmdbCache.lang, lang), inArray(schema.tmdbCache.tmdbId, ids.slice(i, i + 1000))));
      for (const c of cached) tmdbMap.set(c.tmdbId, c.data as TmdbDetails);
    }
  }
  return rows.map((r, idx) => {
    // Our own id and category win over `raw`: that is what clients send back to us.
    const idField = kind === "series" ? "series_id" : "stream_id";
    const out: Record<string, unknown> = { ...r.raw, num: idx + 1, name: r.name, [idField]: r.xtreamId, category_id: r.categoryXtreamId };
    if (kind === "live" || kind === "vod") {
      const ext = String(r.raw.container_extension ?? (kind === "live" ? "ts" : "mp4"));
      out.direct_source = "";
    }
    const d = r.tmdbId ? tmdbMap.get(r.tmdbId) : undefined;
    if (d) Object.assign(out, kind === "vod" ? vodListFields(ctx, d) : seriesListFields(ctx, d));
    return out;
  });
}

function trailerKey(d: TmdbDetails) {
  const v = d.videos?.results?.find((x) => x.site === "YouTube" && x.type === "Trailer") ?? d.videos?.results?.find((x) => x.site === "YouTube");
  return v?.key ?? "";
}
function people(d: TmdbDetails) {
  const cast = (d.credits?.cast ?? []).slice(0, 10).map((c) => c.name).join(", ");
  const director = (d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name).join(", ");
  return { cast, director };
}
function certification(d: TmdbDetails, lang: string) {
  const cc = lang.split("-")[1] ?? "US";
  const r = d.release_dates?.results?.find((x) => x.iso_3166_1 === cc) ?? d.release_dates?.results?.find((x) => x.iso_3166_1 === "US");
  const cert = r?.release_dates?.find((x) => x.certification)?.certification;
  if (cert) return cert;
  const t = d.content_ratings?.results?.find((x) => x.iso_3166_1 === cc) ?? d.content_ratings?.results?.find((x) => x.iso_3166_1 === "US");
  return t?.rating ?? "";
}
function rating(d: TmdbDetails) {
  const r = Number(d.vote_average ?? 0);
  return { rating: r ? r.toFixed(1) : "0", rating_5based: Math.round((r / 2) * 10) / 10 };
}

function vodListFields(ctx: ApiContext, d: TmdbDetails) {
  const { cast, director } = people(d);
  return {
    stream_icon: imageUrl(ctx.baseUrl, "w500", d.poster_path),
    ...rating(d),
    tmdb_id: d.id, tmdb: d.id,
    title: d.title ?? "", year: (d.release_date ?? "").slice(0, 4),
    plot: d.overview ?? "", genre: (d.genres ?? []).map((g) => g.name).join(", "),
    releasedate: d.release_date ?? "", release_date: d.release_date ?? "",
    cast, director, youtube_trailer: trailerKey(d),
    backdrop_path: d.backdrop_path ? [imageUrl(ctx.baseUrl, "w1280", d.backdrop_path)] : [],
  };
}
function seriesListFields(ctx: ApiContext, d: TmdbDetails) {
  const { cast, director } = people(d);
  return {
    cover: imageUrl(ctx.baseUrl, "w500", d.poster_path),
    ...rating(d),
    tmdb: d.id, tmdb_id: d.id,
    title: d.name ?? "", year: (d.first_air_date ?? "").slice(0, 4),
    plot: d.overview ?? "", genre: (d.genres ?? []).map((g) => g.name).join(", "),
    releaseDate: d.first_air_date ?? "", release_date: d.first_air_date ?? "",
    cast, director, youtube_trailer: trailerKey(d),
    episode_run_time: String(d.episode_run_time?.[0] ?? ""),
    backdrop_path: d.backdrop_path ? [imageUrl(ctx.baseUrl, "w1280", d.backdrop_path)] : [],
  };
}

async function getItem(kind: Kind, xtreamId: string) {
  const [it] = await db.select().from(schema.items).where(and(eq(schema.items.kind, kind), eq(schema.items.xtreamId, xtreamId), visibleItem));
  return it ?? null;
}

async function upstreamInfo(ctx: ApiContext, kind: "vod" | "series", xtreamId: string) {
  const [cached] = await db.select().from(schema.infoCache).where(and(eq(schema.infoCache.kind, kind), eq(schema.infoCache.xtreamId, xtreamId)));
  if (cached && Date.now() - cached.fetchedAt.getTime() < INFO_TTL_MS) return cached.data;
  try {
    const data = kind === "vod" ? await ctx.upstream.vodInfo(xtreamId) : await ctx.upstream.seriesInfo(xtreamId);
    await db.insert(schema.infoCache).values({ kind, xtreamId, data })
      .onConflictDoUpdate({ target: [schema.infoCache.kind, schema.infoCache.xtreamId], set: { data, fetchedAt: new Date() } });
    return data;
  } catch (e) {
    if (cached) return cached.data;
    if (e instanceof XtreamError) return {};
    throw e;
  }
}

async function details(ctx: ApiContext, mediaType: "movie" | "tv", tmdbId: number | null) {
  if (!tmdbId) return null;
  const lang = ctx.settings.tmdb_language || "fr-FR";
  const cached = await getCachedDetails(mediaType, tmdbId, lang);
  if (cached) return cached;
  const client = await getTmdbClient();
  return client ? getDetails(client, mediaType, tmdbId).catch(() => null) : null;
}

export async function vodInfo(ctx: ApiContext, vodId: string) {
  const it = await getItem("vod", vodId);
  if (!it) return null;
  const up = (await upstreamInfo(ctx, "vod", vodId)) as { info?: Record<string, unknown>; movie_data?: Record<string, unknown> };
  const d = await details(ctx, "movie", it.tmdbId);
  const ext = String(it.raw.container_extension ?? up.movie_data?.container_extension ?? "mp4");
  const movie_data = {
    ...(up.movie_data ?? {}), stream_id: it.xtreamId, name: it.name, added: it.raw.added ?? up.movie_data?.added ?? "",
    category_id: it.categoryXtreamId, container_extension: ext, custom_sid: it.raw.custom_sid ?? "",
    direct_source: "",
  };
  let info: Record<string, unknown> = { ...(up.info ?? {}) };
  if (d) {
    const { cast, director } = people(d);
    const poster = imageUrl(ctx.baseUrl, "w500", d.poster_path);
    info = {
      ...info,
      tmdb_id: d.id, name: it.name, o_name: d.original_title ?? "",
      cover_big: poster, movie_image: poster,
      releasedate: d.release_date ?? "", release_date: d.release_date ?? "",
      youtube_trailer: trailerKey(d), director, actors: cast, cast,
      description: d.overview ?? "", plot: d.overview ?? "", tagline: d.tagline ?? "",
      age: certification(d, ctx.settings.tmdb_language || "fr-FR"),
      country: (d.production_countries ?? []).map((c) => c.name).join(", "),
      genre: (d.genres ?? []).map((g) => g.name).join(", "),
      backdrop_path: d.backdrop_path ? [imageUrl(ctx.baseUrl, "w1280", d.backdrop_path)] : [],
      duration_secs: (d.runtime ?? 0) * 60, duration: fmtDuration((d.runtime ?? 0) * 60),
      ...rating(d),
    };
  } else {
    // rewrite upstream image urls? keep as-is
    info.name ??= it.name;
  }
  return { info, movie_data };
}

export async function seriesInfo(ctx: ApiContext, seriesId: string) {
  const it = await getItem("series", seriesId);
  if (!it) return null;
  const up = (await upstreamInfo(ctx, "series", seriesId)) as { seasons?: Record<string, unknown>[]; info?: Record<string, unknown>; episodes?: Record<string, Record<string, unknown>[]> | Record<string, unknown>[][] };
  const d = await details(ctx, "tv", it.tmdbId);
  let info: Record<string, unknown> = { ...(up.info ?? {}), name: it.name, category_id: it.categoryXtreamId };
  let seasons = up.seasons ?? [];
  if (d) {
    const { cast, director } = people(d);
    info = {
      ...info, ...seriesListFields(ctx, d),
      name: it.name, o_name: d.original_name ?? "", title: d.name ?? it.name,
      last_modified: it.raw.last_modified ?? info.last_modified ?? "",
      cast, director, tagline: d.tagline ?? "",
      age: certification(d, ctx.settings.tmdb_language || "fr-FR"),
      status: d.status ?? "", num_seasons: d.number_of_seasons ?? seasons.length, num_episodes: d.number_of_episodes ?? "",
    };
    const tmdbSeasons = (d as { seasons?: { season_number: number; name: string; overview: string; air_date: string; episode_count: number; poster_path: string | null; id: number }[] }).seasons ?? [];
    if (tmdbSeasons.length) {
      seasons = tmdbSeasons.map((s) => ({
        id: s.id, air_date: s.air_date ?? "", episode_count: s.episode_count, name: s.name, overview: s.overview ?? "",
        season_number: s.season_number, cover: imageUrl(ctx.baseUrl, "w500", s.poster_path), cover_big: imageUrl(ctx.baseUrl, "w780", s.poster_path),
      }));
    }
  }
  // Rewrite episode stream URLs (direct_source) and keep the rest of the structure.
  const episodes = rewriteEpisodes(ctx, up.episodes);
  return { seasons, info, episodes };
}

function rewriteEpisodes(ctx: ApiContext, eps: unknown) {
  const fix = (e: Record<string, unknown>) => {
    const ext = String(e.container_extension ?? "mp4");
    return { ...e, direct_source: "" };
  };
  if (Array.isArray(eps)) return eps.map((season) => Array.isArray(season) ? season.map(fix) : season);
  if (eps && typeof eps === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(eps as Record<string, unknown>)) out[k] = Array.isArray(v) ? v.map(fix) : v;
    return out;
  }
  return {};
}

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Is a stream id visible (used by stream redirect routes)? */
export async function isVisibleStream(kind: "live" | "movie" | "series", id: string) {
  if (kind === "series") {
    // Episode ids are not catalogued; allow (series list-level hiding is enforced in get_series/get_series_info).
    return true;
  }
  const it = await getItem(kind === "live" ? "live" : "vod", id);
  return Boolean(it);
}

export async function counts() {
  const rows = await db.select({
    kind: schema.items.kind, total: sql<number>`count(*)::int`,
    hidden: sql<number>`count(*) filter (where ${schema.items.hiddenByRule} or ${schema.items.hiddenManual})::int`,
    matched: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual'))::int`,
    unmatched: sql<number>`count(*) filter (where ${schema.items.matchStatus} = 'unmatched')::int`,
    pending: sql<number>`count(*) filter (where ${schema.items.matchStatus} = 'pending')::int`,
  }).from(schema.items).groupBy(schema.items.kind);
  const cats = await db.select({ kind: schema.categories.kind, total: sql<number>`count(*)::int`, hidden: sql<number>`count(*) filter (where ${schema.categories.hiddenByRule} or ${schema.categories.hiddenManual})::int` }).from(schema.categories).groupBy(schema.categories.kind);
  return { items: rows, categories: cats };
}

