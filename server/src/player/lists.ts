import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { slug } from "@/shared";
import { contentsGeneration, QUALITY_RANK, trendingContents } from "@/catalog";
import type { Env, RestContext } from "./context";
import { BadRequest, badQuery, json } from "./http";
import { byRelease, isNewRelease, NO_RELEASE, visibleContent } from "./contents";
import { studioFilter } from "./studios";
import { getProgress } from "./progress";
import { contentItem } from "./cards";
import type { CatalogRow, Page } from "./types";

/** `/movies`, `/series`: the rows of the catalogue screen, or one filtered, cursor-paginated list ("Voir tout"). */

const ROW_SIZE = 20,
  PAGE_DEFAULT = 30,
  PAGE_MAX = 100;

const SORTS = ["release", "recent", "latest_episodes", "title", "year", "rating"] as const;
const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v);
const listSchema = z.object({
  genre: z.string().optional(),
  sort: z.enum(SORTS, { error: `sort doit valoir ${SORTS.join(", ")}` }).optional(),
  language: z.string().optional(),
  min_quality: z.preprocess(upper, z.enum(["SD", "HD", "FHD", "4K"], { error: "min_quality doit valoir SD, HD, FHD ou 4K" })).optional(),
  dynamic_range: z.preprocess(upper, z.enum(["HDR", "DV"], { error: "dynamic_range doit valoir HDR ou DV" })).optional(),
  vf_available: z
    .enum(["1", "true", "0", "false"], { error: "vf_available doit valoir 1 ou 0" })
    .transform((v) => v === "1" || v === "true")
    .optional(),
  studio: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number({ error: "limit doit être un entier positif" })
    .int("limit doit être un entier positif")
    .positive("limit doit être un entier positif")
    .optional(),
});
/** A query of `/movies`, `/series`, parsed: what `listContents` takes from the app and from the admin. */
export type ListQuery = z.infer<typeof listSchema>;

/** The router of one kind, mounted at `/movies` or `/series`. */
export function listRoutes(kind: "vod" | "series") {
  const routes = new Hono<Env>();
  routes.get("/", zValidator("query", listSchema, badQuery), async (c) => {
    const q = c.req.valid("query");
    const isList = Boolean(
      q.genre || q.cursor || q.sort || q.language || q.min_quality || q.dynamic_range || q.vf_available || q.studio || q.limit,
    );
    return json(isList ? await listContents(c.get("ctx"), kind, q) : await catalogRows(c.get("ctx"), kind));
  });
  return routes;
}

// ---------------------------------------------------------------- genres

type Genre = { id: number; slug: string; name: string; total: number };
/**
 * The genres and their totals take a scan of the visible contents (30 to 50 ms for the movies):
 * kept per (kind, adult setting) until the grouping rewrites the contents (`contentsGeneration`).
 */
const genreCache = new Map<string, { generation: number; genres: Promise<Genre[]> }>();
function genresOf(ctx: RestContext, kind: "vod" | "series"): Promise<Genre[]> {
  const key = `${kind}:${ctx.serveAdult}`;
  const generation = contentsGeneration(); // read before the query: a change during it makes the result stale
  const hit = genreCache.get(key);
  if (hit?.generation === generation) return hit.genres;
  const genres = db
    .execute<{ id: number; name: string; n: number }>(sql`
      select g.id, g.name, count(*)::int as n
      from ${schema.catalogContents}, unnest(genre_ids, genres) as g(id, name)
      where ${visibleContent(ctx, kind)} group by g.id, g.name order by n desc, g.name`)
    .then((rows) => rows.map((r) => ({ id: r.id, slug: slug(r.name), name: r.name, total: r.n })));
  genreCache.set(key, { generation, genres }); // the promise: simultaneous requests share one query
  genres.catch(() => {
    if (genreCache.get(key)?.genres === genres) genreCache.delete(key); // a failure is not kept
  });
  return genres;
}

// ---------------------------------------------------------------- rows

/** « Top 10 », « Nouveautés » (or « Derniers épisodes »), then one row per TMDB genre by release date, twenty cards each. */
export async function catalogRows(ctx: RestContext, kind: "vod" | "series"): Promise<CatalogRow[]> {
  const genres = await genresOf(ctx, kind);
  const recentFilter = kind === "vod" ? and(visibleContent(ctx, kind), isNewRelease()) : visibleContent(ctx, kind);
  const [{ n: totalRecent }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.catalogContents).where(recentFilter);
  const recent = await db
    .select()
    .from(schema.catalogContents)
    .where(recentFilter)
    .orderBy(desc(schema.catalogContents.addedAt), desc(schema.catalogContents.id))
    .limit(ROW_SIZE);
  const rows: { id: string; name: string; total: number; cards: Content[] }[] = [];
  const top = await topTen(ctx, kind);
  if (top.length) rows.push({ id: "top10", name: "Top 10 de la semaine", total: top.length, cards: top });
  if (recent.length)
    rows.push({ id: "recent", name: kind === "series" ? "Derniers épisodes" : "Nouveautés", total: totalRecent, cards: recent });
  // One indexed query per genre (`contents_release_idx`, 1 to 3 ms each), side by side: a single
  // `row_number()` over every genre sorts the whole catalogue and takes longer (65 to 115 ms).
  const byGenre = await Promise.all(
    genres.map((g) =>
      db
        .select()
        .from(schema.catalogContents)
        .where(and(visibleContent(ctx, kind), sql`${schema.catalogContents.genreIds} @> array[${g.id}]::int[]`))
        .orderBy(desc(byRelease), desc(schema.catalogContents.id))
        .limit(ROW_SIZE),
    ),
  );
  genres.forEach((g, i) => {
    rows.push({ id: g.slug, name: g.name, total: g.total, cards: byGenre[i] });
  });
  const progress = await getProgress(rows.flatMap((r) => r.cards.map((c) => c.key)));
  const field = kind === "series" ? "series" : "movies";
  return rows.map(
    (r) =>
      ({ id: r.id, name: r.name, total: r.total, [field]: r.cards.map((c) => contentItem(ctx, c, progress.get(c.key))) }) as CatalogRow,
  );
}

/** TMDB's weekly trending order (the `trending` step), kept to what the app sees. */
const topTen = (ctx: RestContext, kind: "vod" | "series") => trendingContents(kind, visibleContent(ctx, kind), 10);

// ---------------------------------------------------------------- one list, by cursor

export const encodeCursor = (v: unknown, id: number) => Buffer.from(JSON.stringify([v, id])).toString("base64url");
export const decodeCursor = (s: string): [unknown, number] | null => {
  try {
    const v = JSON.parse(Buffer.from(s, "base64url").toString());
    return Array.isArray(v) && v.length === 2 && Number.isInteger(v[1]) ? [v[0], v[1]] : null;
  } catch {
    return null;
  }
};

/** `/movies?genre=…&cursor=…`: by cursor on a stable sort key. */
export async function listContents(ctx: RestContext, kind: "vod" | "series", q: ListQuery): Promise<Page> {
  const where: SQL[] = [visibleContent(ctx, kind)];
  if (q.genre === "recent" && kind === "vod") where.push(isNewRelease());
  if (q.genre && q.genre !== "recent") {
    const g = (await genresOf(ctx, kind)).find((x) => x.slug === q.genre);
    if (!g) return { items: [], next_cursor: null };
    where.push(sql`${schema.catalogContents.genreIds} @> array[${g.id}]::int[]`);
  }
  if (q.studio) {
    const f = studioFilter(q.studio);
    if (!f) throw new BadRequest("studio inconnu");
    where.push(f);
  }
  if (q.language) where.push(sql`${schema.catalogContents.languages} @> array[${q.language.toUpperCase()}]::text[]`);
  if (q.vf_available) where.push(sql`${schema.catalogContents.languages} @> array['VF']::text[]`);
  if (q.min_quality) where.push(sql`${schema.catalogContents.maxQualityRank} >= ${QUALITY_RANK[q.min_quality]}`);
  if (q.dynamic_range === "DV") where.push(eq(schema.catalogContents.dynamicRange, "DV"));
  if (q.dynamic_range === "HDR") where.push(inArray(schema.catalogContents.dynamicRange, ["HDR", "DV"]));
  const limit = Math.min(PAGE_MAX, q.limit ?? PAGE_DEFAULT);
  const sort = q.sort ?? (q.genre === "recent" ? (kind === "series" ? "latest_episodes" : "recent") : "release");
  /** `valid`: whether a cursor's value has the type this sort writes (a wrong one would reach Postgres as a cast error). */
  type Key = { col: SQL; dir: "asc" | "desc"; of: (c: Content) => unknown; valid: (v: unknown) => boolean };
  const isText = (v: unknown) => typeof v === "string";
  const isDate = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
  const isNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const keys: Record<(typeof SORTS)[number], Key> = {
    release: { col: byRelease, dir: "desc", of: (c) => c.releaseDate ?? NO_RELEASE, valid: isText },
    recent: { col: sql`${schema.catalogContents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString(), valid: isDate },
    latest_episodes: { col: sql`${schema.catalogContents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString(), valid: isDate },
    title: { col: sql`${schema.catalogContents.title}`, dir: "asc", of: (c) => c.title, valid: isText },
    year: { col: sql`coalesce(${schema.catalogContents.year}, 0)`, dir: "desc", of: (c) => c.year ?? 0, valid: isNumber },
    rating: { col: sql`coalesce(${schema.catalogContents.rating}, 0)`, dir: "desc", of: (c) => c.rating ?? 0, valid: isNumber },
  };
  const k = keys[sort];
  if (q.cursor) {
    const cur = decodeCursor(q.cursor);
    if (!cur || !k.valid(cur[0])) throw new BadRequest("cursor invalide");
    const [v, id] = cur;
    const val = sort === "recent" || sort === "latest_episodes" ? sql`${String(v)}::timestamptz` : sql`${v}`;
    where.push(
      k.dir === "desc"
        ? sql`(${k.col}, ${schema.catalogContents.id}) < (${val}, ${id})`
        : sql`(${k.col}, ${schema.catalogContents.id}) > (${val}, ${id})`,
    );
  }
  const order = k.dir === "desc" ? [desc(k.col), desc(schema.catalogContents.id)] : [asc(k.col), asc(schema.catalogContents.id)];
  const rows = await db
    .select()
    .from(schema.catalogContents)
    .where(and(...where))
    .orderBy(...order)
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const progress = await getProgress(pageRows.map((c) => c.key));
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map((c) => contentItem(ctx, c, progress.get(c.key))),
    next_cursor: rows.length > limit && last ? encodeCursor(k.of(last), last.id) : null,
  };
}
