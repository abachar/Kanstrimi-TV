import { db, schema } from "@/db";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Content, Item } from "@/db/schema";
import { slug } from "@/lib/grouping/tags";
import { deaccent } from "@/lib/grouping/cardFields";
import { getSettings } from "@/lib/settings";
import { XtreamClient } from "@/lib/xtream/client";
import { getProgress, resumeKeys, isResumable, type Progress } from "./progress";
import { favoriteKeys, favoriteSet } from "./favorites";
import { baseCard, gridCard, sheetCard, kindOf, playableOfItem, versionsOf, versionsSummary, progressWire, sortLanguages, qualityOfRank, hintOf, DEFAULT_LANGUAGE_ORDER, type RestContext } from "./serialize";
import { ensureEpisodes, loadEpisodes, seasonsWire, seriesVersions, episodeWire, type EpisodeRow } from "./episodes";
import { QUALITY_RANK } from "@/lib/grouping/tags";
import type { Card, CatalogRow, ChannelGroupWire, ChannelWire, Home, HomeRow, Page, Playback, SearchResults, ServerInfo, Version, EpisodeRef } from "./types";
import pkg from "../../../package.json";

const ROW_SIZE = 20, HOME_ROW = 24, PAGE_DEFAULT = 30, PAGE_MAX = 100;
/** Visible for the app: the admin's visibility, and adult contents only when the setting allows them. */
const visible = (ctx: RestContext, kind: "live" | "vod" | "series") =>
  and(eq(schema.contents.kind, kind), eq(schema.contents.visible, true), ctx.serveAdult ? undefined : eq(schema.contents.adult, false))!;
const visibleAny = (ctx: RestContext) => and(eq(schema.contents.visible, true), ctx.serveAdult ? undefined : eq(schema.contents.adult, false))!;

// ---------------------------------------------------------------- helpers

/** Visible variants of a content, best first, with the category names they sit in. */
async function variantsOf(content: Content): Promise<{ items: Item[]; categoryNames: Map<string, string> }> {
  const items = await db.select().from(schema.items).where(and(eq(schema.items.contentId, content.id),
    eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false),
    sql`not exists (select 1 from ${schema.categories} k where k.kind = ${schema.items.kind} and k.xtream_id = ${schema.items.categoryXtreamId} and (k.hidden_by_rule or k.hidden_manual))`))
    .orderBy(desc(schema.items.qualityRank), asc(schema.items.position), asc(schema.items.id));
  const catIds = [...new Set(items.map((i) => i.categoryXtreamId).filter((x): x is string => x !== null))];
  const cats = catIds.length ? await db.select().from(schema.categories).where(and(eq(schema.categories.kind, content.kind), inArray(schema.categories.xtreamId, catIds))) : [];
  return { items, categoryNames: new Map(cats.map((c) => [c.xtreamId, c.name])) };
}

export async function contentByKey(ctx: RestContext, key: string): Promise<Content | null> {
  const [c] = await db.select().from(schema.contents).where(and(eq(schema.contents.key, key), visibleAny(ctx)));
  return c ?? null;
}

async function upstreamClient(): Promise<XtreamClient | null> {
  const s = await getSettings();
  return s.xtream_url && s.xtream_username ? new XtreamClient(s.xtream_url, s.xtream_username, s.xtream_password) : null;
}

// ---------------------------------------------------------------- info

export async function serverInfo(ctx: RestContext): Promise<ServerInfo> {
  const [counts, s, rate, langs] = await Promise.all([
    db.select({ kind: schema.contents.kind, n: sql<number>`count(*)::int` }).from(schema.contents).where(visibleAny(ctx)).groupBy(schema.contents.kind),
    getSettings(),
    db.select({
      matched: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual'))::int`,
      decided: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual','unmatched'))::int`,
    }).from(schema.items).where(and(inArray(schema.items.kind, ["vod", "series"]), eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false), ctx.serveAdult ? undefined : eq(schema.items.adult, false))),
    db.execute<{ l: string }>(sql`select distinct unnest(languages) as l from ${schema.contents} where visible and kind <> 'live' ${ctx.serveAdult ? sql`` : sql`and not adult`}`),
  ]);
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  return {
    server_version: pkg.version,
    counts: { movies: n("vod"), series: n("series"), channels: n("live") },
    last_import: s.last_sync_at || null,
    tmdb_rate: rate[0].decided ? Math.round((rate[0].matched / rate[0].decided) * 100) / 100 : null,
    catalog_languages: sortLanguages(langs.map((r) => r.l)),
    default_language_order: DEFAULT_LANGUAGE_ORDER,
  };
}

// ---------------------------------------------------------------- lists

type Genre = { id: number; slug: string; name: string; total: number };
async function genresOf(ctx: RestContext, kind: "vod" | "series"): Promise<Genre[]> {
  const rows = await db.execute<{ id: number; name: string; n: number }>(sql`
    select g.id, g.name, count(*)::int as n
    from ${schema.contents} c, unnest(c.genre_ids, c.genres) as g(id, name)
    where c.kind = ${kind} and c.visible ${ctx.serveAdult ? sql`` : sql`and not c.adult`} group by g.id, g.name order by n desc, g.name`);
  return rows.map((r) => ({ id: r.id, slug: slug(r.name), name: r.name, total: r.n }));
}

/** `/movies`, `/series`: "Nouveautés" then one row per TMDB genre, twenty cards each. */
export async function catalogRows(ctx: RestContext, kind: "vod" | "series"): Promise<CatalogRow[]> {
  const genres = await genresOf(ctx, kind);
  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.contents).where(visible(ctx, kind));
  const recent = await db.select().from(schema.contents).where(visible(ctx, kind)).orderBy(desc(schema.contents.addedAt), desc(schema.contents.id)).limit(ROW_SIZE);
  const rows: { id: string; name: string; total: number; cards: Content[] }[] = [
    { id: "recent", name: kind === "series" ? "Derniers épisodes" : "Nouveautés", total, cards: recent },
  ];
  for (const g of genres) {
    const cards = await db.select().from(schema.contents).where(and(visible(ctx, kind), sql`${schema.contents.genreIds} @> array[${g.id}]::int[]`))
      .orderBy(desc(schema.contents.addedAt), desc(schema.contents.id)).limit(ROW_SIZE);
    rows.push({ id: g.slug, name: g.name, total: g.total, cards });
  }
  const progress = await getProgress(rows.flatMap((r) => r.cards.map((c) => c.key)));
  const field = kind === "series" ? "series" : "movies";
  return rows.map((r) => ({ id: r.id, name: r.name, total: r.total, [field]: r.cards.map((c) => gridCard(ctx, c, progress.get(c.key))) }) as CatalogRow);
}

export type ListQuery = {
  genre?: string; sort?: string; language?: string; min_quality?: string; dynamic_range?: string; vf_available?: string; cursor?: string; limit?: string;
};
const encodeCursor = (v: unknown, id: number) => Buffer.from(JSON.stringify([v, id])).toString("base64url");
const decodeCursor = (s: string): [unknown, number] | null => {
  try { const v = JSON.parse(Buffer.from(s, "base64url").toString()); return Array.isArray(v) && v.length === 2 && Number.isInteger(v[1]) ? [v[0], v[1]] : null; }
  catch { return null; }
};

export class BadRequest extends Error {}

/** `/movies?genre=…&cursor=…`: "Voir tout", by cursor on a stable sort key. */
export async function listContents(ctx: RestContext, kind: "vod" | "series", q: ListQuery): Promise<Page> {
  const where: SQL[] = [visible(ctx, kind)];
  if (q.genre && q.genre !== "recent") {
    const g = (await genresOf(ctx, kind)).find((x) => x.slug === q.genre);
    if (!g) return { items: [], next_cursor: null };
    where.push(sql`${schema.contents.genreIds} @> array[${g.id}]::int[]`);
  }
  if (q.language) where.push(sql`${schema.contents.languages} @> array[${q.language.toUpperCase()}]::text[]`);
  if (q.vf_available === "1" || q.vf_available === "true") where.push(sql`${schema.contents.languages} @> array['VF']::text[]`);
  if (q.min_quality) {
    const r = QUALITY_RANK[q.min_quality.toUpperCase() as keyof typeof QUALITY_RANK];
    if (!r) throw new BadRequest("min_quality doit valoir SD, HD, FHD ou 4K");
    where.push(sql`${schema.contents.maxQualityRank} >= ${r}`);
  }
  if (q.dynamic_range) {
    const d = q.dynamic_range.toUpperCase();
    if (d === "DV") where.push(eq(schema.contents.dynamicRange, "DV"));
    else if (d === "HDR") where.push(inArray(schema.contents.dynamicRange, ["HDR", "DV"]));
    else throw new BadRequest("dynamic_range doit valoir HDR ou DV");
  }
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(q.limit) || PAGE_DEFAULT));
  const sort = q.sort ?? (kind === "series" ? "latest_episodes" : "recent");
  type Key = { col: SQL; dir: "asc" | "desc"; of: (c: Content) => unknown };
  const keys: Record<string, Key> = {
    recent: { col: sql`${schema.contents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString() },
    latest_episodes: { col: sql`${schema.contents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString() },
    title: { col: sql`${schema.contents.title}`, dir: "asc", of: (c) => c.title },
    year: { col: sql`coalesce(${schema.contents.year}, 0)`, dir: "desc", of: (c) => c.year ?? 0 },
    rating: { col: sql`coalesce(${schema.contents.rating}, 0)`, dir: "desc", of: (c) => c.rating ?? 0 },
  };
  const k = keys[sort];
  if (!k) throw new BadRequest("sort inconnu");
  if (q.cursor) {
    const cur = decodeCursor(q.cursor);
    if (!cur) throw new BadRequest("cursor invalide");
    const [v, id] = cur;
    const val = sort === "recent" || sort === "latest_episodes" ? sql`${String(v)}::timestamptz` : sql`${v}`;
    where.push(k.dir === "desc" ? sql`(${k.col}, ${schema.contents.id}) < (${val}, ${id})` : sql`(${k.col}, ${schema.contents.id}) > (${val}, ${id})`);
  }
  const order = k.dir === "desc" ? [desc(k.col), desc(schema.contents.id)] : [asc(k.col), asc(schema.contents.id)];
  const rows = await db.select().from(schema.contents).where(and(...where)).orderBy(...order).limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const progress = await getProgress(pageRows.map((c) => c.key));
  const last = pageRows[pageRows.length - 1];
  return { items: pageRows.map((c) => gridCard(ctx, c, progress.get(c.key))), next_cursor: rows.length > limit && last ? encodeCursor(k.of(last), last.id) : null };
}

// ---------------------------------------------------------------- sheets

export async function movieSheet(ctx: RestContext, content: Content): Promise<Card> {
  const { items, categoryNames } = await variantsOf(content);
  const best = items[0];
  const versions = versionsOf(ctx, items.map((i) => playableOfItem(i, i.categoryXtreamId ? categoryNames.get(i.categoryXtreamId) ?? null : null)));
  const [progress, favs] = await Promise.all([getProgress([content.key]), favoriteSet()]);
  return {
    ...sheetCard(ctx, content, { providerCategory: best?.categoryXtreamId ? categoryNames.get(best.categoryXtreamId) ?? null : null, rawTitle: best?.name ?? null }),
    ...versionsSummary(versions),
    progress: progressWire(progress.get(content.key), true),
    versions, is_favorite: favs.has(content.key),
  };
}

/** The whole series in one call: seasons, episodes with versions and progress, current episode. */
export async function seriesSheet(ctx: RestContext, content: Content): Promise<Card> {
  const { items, categoryNames } = await variantsOf(content);
  await ensureEpisodes(content, items, await upstreamClient(), ctx.tmdbLang);
  const episodes = await loadEpisodes(content, items, categoryNames);
  const [progress, favs] = await Promise.all([getProgress(episodes.map((e) => e.key)), favoriteSet()]);
  const seasons = await seasonsWire(ctx, content, episodes, progress);
  const versions = seriesVersions(ctx, episodes);
  const current = episodes.find((e) => isResumable(progress.get(e.key))) ?? episodes.find((e) => !progress.get(e.key));
  const best = items[0];
  const summary = versionsSummary(versions);
  return {
    ...sheetCard(ctx, content, { providerCategory: best?.categoryXtreamId ? categoryNames.get(best.categoryXtreamId) ?? null : null, rawTitle: best?.name ?? null }),
    ...summary,
    hint: seriesHint(summary.languages ?? [], seasons),
    progress: current ? progressWire(progress.get(current.key), true) : null,
    versions, is_favorite: favs.has(content.key), seasons,
    current_episode: current ? episodeRef(current) : null,
  };
}
const episodeRef = (e: EpisodeRow): EpisodeRef => ({ season: e.season, number: e.number, title: e.title });
function seriesHint(languages: string[], seasons: { number: number; episodes: { versions: Version[] }[] }[]): string | null {
  if (hintOf(languages)) return hintOf(languages);
  const last = seasons[seasons.length - 1];
  if (last && languages.includes("VF") && last.episodes.some((e) => !e.versions.some((v) => v.language === "VF"))) return `VF partielle S${last.number}`;
  return null;
}

// ---------------------------------------------------------------- live

async function liveCategories() {
  return db.select().from(schema.categories).where(and(eq(schema.categories.kind, "live"), eq(schema.categories.hiddenByRule, false), eq(schema.categories.hiddenManual, false))).orderBy(asc(schema.categories.position));
}

function channelWire(ctx: RestContext, c: Content, versions: Version[], favs: Set<string>): ChannelWire {
  return {
    id: c.key, name: c.title, number: c.channelNumber, logo: c.logoUrl,
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    has_epg: Boolean(c.epgChannelId), is_favorite: favs.has(c.key), versions,
  };
}

/** `/channels`: every visible live category with its channels and their versions. */
export async function channelGroups(ctx: RestContext): Promise<ChannelGroupWire[]> {
  const cats = await liveCategories();
  const [channels, items, favs] = await Promise.all([
    db.select().from(schema.contents).where(visible(ctx, "live")).orderBy(asc(schema.contents.channelNumber), asc(schema.contents.title), asc(schema.contents.id)),
    db.select().from(schema.items).where(and(eq(schema.items.kind, "live"), eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false), sql`${schema.items.contentId} is not null`)),
    favoriteSet(),
  ]);
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const byContent = new Map<number, Item[]>();
  for (const it of items) { if (it.categoryXtreamId && !catName.has(it.categoryXtreamId)) continue; byContent.set(it.contentId!, [...(byContent.get(it.contentId!) ?? []), it]); }
  const byCat = new Map<string, ChannelWire[]>();
  for (const c of channels) {
    const its = byContent.get(c.id) ?? [];
    if (!its.length || !c.categoryXtreamId) continue;
    const versions = versionsOf(ctx, its.map((i) => playableOfItem(i, i.categoryXtreamId ? catName.get(i.categoryXtreamId) ?? null : null)));
    byCat.set(c.categoryXtreamId, [...(byCat.get(c.categoryXtreamId) ?? []), channelWire(ctx, c, versions, favs)]);
  }
  return cats.filter((k) => byCat.has(k.xtreamId)).map((k) => ({ id: slug(k.name) + "-" + k.xtreamId, name: k.name, channels: byCat.get(k.xtreamId)! }));
}

/** `/channels/{id}`: one channel; `now` / `next` stay null until the EPG lives in the database (block 2). */
export async function channelSheet(ctx: RestContext, content: Content): Promise<ChannelWire> {
  const { items, categoryNames } = await variantsOf(content);
  const versions = versionsOf(ctx, items.map((i) => playableOfItem(i, i.categoryXtreamId ? categoryNames.get(i.categoryXtreamId) ?? null : null)));
  return { ...channelWire(ctx, content, versions, await favoriteSet()), now: null, next: null };
}

// ---------------------------------------------------------------- home

export async function home(ctx: RestContext): Promise<Home> {
  const [resume, recentMovies, recentSeries, favKeys] = await Promise.all([
    resumeKeys(20),
    db.select().from(schema.contents).where(and(visible(ctx, "vod"), sql`${schema.contents.key} like 'tmdb:%'`)).orderBy(desc(schema.contents.addedAt), desc(schema.contents.id)).limit(HOME_ROW),
    db.select().from(schema.contents).where(visible(ctx, "series")).orderBy(desc(schema.contents.addedAt), desc(schema.contents.id)).limit(HOME_ROW),
    favoriteKeys(),
  ]);
  const rows: HomeRow[] = [];
  const resumeCards = await resumeCardsOf(ctx, resume);
  if (resumeCards.length) rows.push({ id: "resume", kind: "resume", title: "Reprendre", cards: resumeCards });
  const progress = await getProgress([...recentMovies, ...recentSeries].map((c) => c.key));
  rows.push({ id: "recent-movies", kind: "recent_movies", title: "Films récents", cards: recentMovies.map((c) => gridCard(ctx, c, progress.get(c.key))) });
  rows.push({ id: "recent-series", kind: "recent_series", title: "Séries récentes", cards: recentSeries.map((c) => gridCard(ctx, c, progress.get(c.key))) });
  if (favKeys.length) {
    const favs = await db.select().from(schema.contents).where(and(visibleAny(ctx), inArray(schema.contents.key, favKeys)));
    const order = new Map(favKeys.map((k, i) => [k, i]));
    favs.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
    if (favs.length) rows.push({ id: "favorites", kind: "favorites", title: "Ma liste", cards: favs.map((c) => gridCard(ctx, c)) });
  }
  const heroContent = recentMovies.find((c) => c.posterPath && c.backdropPath) ?? recentMovies[0];
  let hero: Home["hero"] = null;
  if (heroContent) {
    const { items, categoryNames } = await variantsOf(heroContent);
    const versions = versionsOf(ctx, items.map((i) => playableOfItem(i, i.categoryXtreamId ? categoryNames.get(i.categoryXtreamId) ?? null : null)));
    hero = {
      card: { ...gridCard(ctx, heroContent, progress.get(heroContent.key)), backdrop: sheetCard(ctx, heroContent, { providerCategory: null, rawTitle: null }).backdrop, ...versionsSummary(versions) },
      tagline: "FILM · NOUVEAUTÉ", overview: heroContent.overview, runtime: heroContent.runtime, certification: heroContent.certification, versions,
    };
  }
  return { hero, rows, generated_at: new Date().toISOString() };
}

/** Resume cards: a movie card, or the series card wearing the episode's progress and reference. */
async function resumeCardsOf(ctx: RestContext, resume: Progress[]): Promise<Card[]> {
  if (!resume.length) return [];
  const movieKeys = resume.filter((p) => !/:s\d{2}e\d{2}$/.test(p.contentKey)).map((p) => p.contentKey);
  const episodeKeys = resume.filter((p) => /:s\d{2}e\d{2}$/.test(p.contentKey)).map((p) => p.contentKey);
  const movies = movieKeys.length ? await db.select().from(schema.contents).where(and(visible(ctx, "vod"), inArray(schema.contents.key, movieKeys))) : [];
  const episodes = episodeKeys.length ? await db.select({ e: schema.episodes, c: schema.contents }).from(schema.episodes)
    .innerJoin(schema.contents, eq(schema.contents.id, schema.episodes.contentId))
    .where(and(inArray(schema.episodes.key, episodeKeys), visibleAny(ctx))) : [];
  const byKey = new Map<string, Card>();
  for (const c of movies) byKey.set(c.key, { ...baseCard(ctx, c), backdrop: imageOf(ctx, c), progress: null, });
  for (const { e, c } of episodes) {
    // Badges of the episode itself when its sources are known; the series' otherwise.
    byKey.set(e.key, { ...baseCard(ctx, c), id: e.key, kind: "episode", backdrop: imageOf(ctx, c), progress: null, episode: { season: e.season, number: e.number, title: e.title } });
  }
  return resume.flatMap((p) => { const card = byKey.get(p.contentKey); return card ? [{ ...card, progress: progressWire(p, false) }] : []; });
}
const imageOf = (ctx: RestContext, c: Content) => sheetCard(ctx, c, { providerCategory: null, rawTitle: null }).backdrop ?? null;

// ---------------------------------------------------------------- playback

export async function playback(ctx: RestContext, key: string): Promise<Playback | null> {
  const ep = /^(.*):s(\d{2})e(\d{2})$/.exec(key);
  if (ep) {
    const content = await contentByKey(ctx, ep[1]);
    if (!content || content.kind !== "series") return null;
    const { items, categoryNames } = await variantsOf(content);
    await ensureEpisodes(content, items, await upstreamClient(), ctx.tmdbLang);
    const episodes = await loadEpisodes(content, items, categoryNames);
    const idx = episodes.findIndex((e) => e.key === key);
    if (idx === -1) return null;
    const e = episodes[idx], next = episodes[idx + 1];
    const p = (await getProgress([key])).get(key);
    const nextVersions = next ? versionsOf(ctx, next.playables, false) : [];
    return {
      versions: versionsOf(ctx, e.playables),
      resume_at: isResumable(p) ? p.position : null,
      duration: p?.duration || (e.runtime ? e.runtime * 60 : null),
      next: next ? {
        id: next.key, title: next.title, season: next.season, number: next.number, runtime: next.runtime,
        ...versionsSummary(nextVersions), still: episodeWire(ctx, next).still,
      } : null,
    };
  }
  const content = await contentByKey(ctx, key);
  if (!content) return null;
  const { items, categoryNames } = await variantsOf(content);
  const versions = versionsOf(ctx, items.map((i) => playableOfItem(i, i.categoryXtreamId ? categoryNames.get(i.categoryXtreamId) ?? null : null)));
  if (content.kind === "live") return { versions, resume_at: null, duration: null, next: null };
  if (content.kind === "series") return null;
  const p = (await getProgress([key])).get(key);
  return { versions, resume_at: isResumable(p) ? p.position : null, duration: p?.duration || (content.runtime ? content.runtime * 60 : null), next: null };
}

/** The content a progress or favourite key belongs to; null when nothing visible matches. */
export async function keyExists(ctx: RestContext, key: string): Promise<boolean> {
  const ep = /^(.*):s\d{2}e\d{2}$/.exec(key);
  if (ep) return (await db.select({ id: schema.episodes.id }).from(schema.episodes).where(eq(schema.episodes.key, key))).length > 0 && (await contentByKey(ctx, ep[1])) !== null;
  return (await contentByKey(ctx, key)) !== null;
}

// ---------------------------------------------------------------- search

export async function search(ctx: RestContext, query: string, scope: "all" | "movies" | "series" | "live"): Promise<SearchResults> {
  const q = deaccent(query.trim());
  if (!q) return { query, best: null, movies: [], series: [], live: [] };
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!terms.length) return { query, best: null, movies: [], series: [], live: [] };
  const tsq = terms.map((t) => `${t.replace(/'/g, "''")}:*`).join(" & ");
  const rank = sql`ts_rank(${schema.contents.search}, to_tsquery('simple', ${tsq}))`;
  const find = (kind: "vod" | "series" | "live") => db.select().from(schema.contents)
    .where(and(visible(ctx, kind), sql`${schema.contents.search} @@ to_tsquery('simple', ${tsq})`))
    .orderBy(desc(rank), desc(schema.contents.voteCount), asc(schema.contents.title)).limit(20);
  const [movies, series, live] = await Promise.all([
    scope === "all" || scope === "movies" ? find("vod") : [], scope === "all" || scope === "series" ? find("series") : [], scope === "all" || scope === "live" ? find("live") : [],
  ]);
  const progress = await getProgress([...movies, ...series].map((c) => c.key));
  const cats = live.length ? new Map((await liveCategories()).map((c) => [c.xtreamId, c.name])) : new Map<string, string>();
  const m = movies.map((c) => gridCard(ctx, c, progress.get(c.key)));
  const s = series.map((c) => gridCard(ctx, c, progress.get(c.key)));
  const l = live.map((c) => ({ ...baseCard(ctx, c), genres: c.categoryXtreamId && cats.get(c.categoryXtreamId) ? [cats.get(c.categoryXtreamId)!] : [] }));
  const all = [...m, ...s, ...l];
  const starts = (c: Card) => deaccent(c.title).startsWith(q);
  const best = all.find(starts) ?? all[0] ?? null;
  return { query, best, movies: m, series: s, live: l };
}

export { kindOf };
