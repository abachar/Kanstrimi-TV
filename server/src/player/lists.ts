import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { slug } from "@/shared";
import { QUALITY_RANK } from "@/catalog";
import type { Env, RestContext } from "./context";
import { BadRequest, json } from "./http";
import { isNewRelease, visibleContent } from "./contents";
import { studioFilter } from "./studios";
import { getProgress } from "./progress";
import { gridCard, imageUrl } from "./cards";
import type { CatalogRow, Page } from "./types";

/** `/movies`, `/series`: the rows of the catalogue screen, or one filtered, cursor-paginated list ("Voir tout"). */

const ROW_SIZE = 20,
  PAGE_DEFAULT = 30,
  PAGE_MAX = 100;

const listQuery = zValidator(
  "query",
  z.object({
    genre: z.string().optional(),
    sort: z.string().optional(),
    language: z.string().optional(),
    min_quality: z.string().optional(),
    dynamic_range: z.string().optional(),
    vf_available: z.string().optional(),
    studio: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.string().optional(),
  }),
);
export type ListQuery = {
  genre?: string;
  sort?: string;
  language?: string;
  min_quality?: string;
  dynamic_range?: string;
  vf_available?: string;
  studio?: string;
  cursor?: string;
  limit?: string;
};

/** The router of one kind, mounted at `/movies` or `/series`. */
export function listRoutes(kind: "vod" | "series") {
  const routes = new Hono<Env>();
  routes.get("/", listQuery, async (c) => {
    const q: ListQuery = c.req.valid("query");
    const isList = Boolean(
      q.genre || q.cursor || q.sort || q.language || q.min_quality || q.dynamic_range || q.vf_available || q.studio || q.limit,
    );
    return json(isList ? await listContents(c.get("ctx"), kind, q) : await catalogRows(c.get("ctx"), kind));
  });
  return routes;
}

// ---------------------------------------------------------------- genres

type Genre = { id: number; slug: string; name: string; total: number };
async function genresOf(ctx: RestContext, kind: "vod" | "series"): Promise<Genre[]> {
  const rows = await db.execute<{ id: number; name: string; n: number }>(sql`
    select g.id, g.name, count(*)::int as n
    from ${schema.catalogContents}, unnest(genre_ids, genres) as g(id, name)
    where ${visibleContent(ctx, kind)} group by g.id, g.name order by n desc, g.name`);
  return rows.map((r) => ({ id: r.id, slug: slug(r.name), name: r.name, total: r.n }));
}

// ---------------------------------------------------------------- rows

/** Release date order, undated last; the same expression as `contents_release_idx`. */
const NO_RELEASE = "0001-01-01";
const byRelease = sql`coalesce(${schema.catalogContents.releaseDate}, ${sql.raw(`'${NO_RELEASE}'`)}::date)`;

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
  for (const g of genres) {
    const cards = await db
      .select()
      .from(schema.catalogContents)
      .where(and(visibleContent(ctx, kind), sql`${schema.catalogContents.genreIds} @> array[${g.id}]::int[]`))
      .orderBy(desc(byRelease), desc(schema.catalogContents.id))
      .limit(ROW_SIZE);
    rows.push({ id: g.slug, name: g.name, total: g.total, cards });
  }
  const progress = await getProgress(rows.flatMap((r) => r.cards.map((c) => c.key)));
  const field = kind === "series" ? "series" : "movies";
  // Films (tvOS POC): the screen's background follows the focused card, a small backdrop blurred behind the rows.
  const card = (c: Content) => ({
    ...gridCard(ctx, c, progress.get(c.key)),
    ...(kind === "vod" ? { backdrop: imageUrl(ctx.baseUrl, "w300", c.backdropPath) || null } : {}),
  });
  return rows.map((r) => ({ id: r.id, name: r.name, total: r.total, [field]: r.cards.map(card) }) as CatalogRow);
}

/** TMDB's weekly trending order (the `trending` step), kept to what the app sees. */
async function topTen(ctx: RestContext, kind: "vod" | "series"): Promise<Content[]> {
  const rows = await db
    .select({ content: schema.catalogContents })
    .from(schema.catalogContents)
    .innerJoin(
      schema.tmdbTrending,
      and(
        eq(schema.tmdbTrending.tmdbId, schema.catalogContents.tmdbId),
        eq(schema.tmdbTrending.mediaType, kind === "vod" ? "movie" : "tv"),
      ),
    )
    .where(visibleContent(ctx, kind))
    .orderBy(asc(schema.tmdbTrending.rank))
    .limit(10);
  return rows.map((r) => r.content);
}

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
  if (q.vf_available === "1" || q.vf_available === "true") where.push(sql`${schema.catalogContents.languages} @> array['VF']::text[]`);
  if (q.min_quality) {
    const r = QUALITY_RANK[q.min_quality.toUpperCase() as keyof typeof QUALITY_RANK];
    if (!r) throw new BadRequest("min_quality doit valoir SD, HD, FHD ou 4K");
    where.push(sql`${schema.catalogContents.maxQualityRank} >= ${r}`);
  }
  if (q.dynamic_range) {
    const d = q.dynamic_range.toUpperCase();
    if (d === "DV") where.push(eq(schema.catalogContents.dynamicRange, "DV"));
    else if (d === "HDR") where.push(inArray(schema.catalogContents.dynamicRange, ["HDR", "DV"]));
    else throw new BadRequest("dynamic_range doit valoir HDR ou DV");
  }
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(q.limit) || PAGE_DEFAULT));
  const sort = q.sort ?? (q.genre === "recent" ? (kind === "series" ? "latest_episodes" : "recent") : "release");
  type Key = { col: SQL; dir: "asc" | "desc"; of: (c: Content) => unknown };
  const keys: Record<string, Key> = {
    release: { col: byRelease, dir: "desc", of: (c) => c.releaseDate ?? NO_RELEASE },
    recent: { col: sql`${schema.catalogContents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString() },
    latest_episodes: { col: sql`${schema.catalogContents.addedAt}`, dir: "desc", of: (c) => c.addedAt.toISOString() },
    title: { col: sql`${schema.catalogContents.title}`, dir: "asc", of: (c) => c.title },
    year: { col: sql`coalesce(${schema.catalogContents.year}, 0)`, dir: "desc", of: (c) => c.year ?? 0 },
    rating: { col: sql`coalesce(${schema.catalogContents.rating}, 0)`, dir: "desc", of: (c) => c.rating ?? 0 },
  };
  const k = keys[sort];
  if (!k) throw new BadRequest("sort inconnu");
  if (q.cursor) {
    const cur = decodeCursor(q.cursor);
    if (!cur) throw new BadRequest("cursor invalide");
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
    items: pageRows.map((c) => gridCard(ctx, c, progress.get(c.key))),
    next_cursor: rows.length > limit && last ? encodeCursor(k.of(last), last.id) : null,
  };
}
