import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, sql } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { searchText, similarityKey } from "@/shared";
import type { Env, RestContext } from "./context";
import { badQuery, json } from "./http";
import { liveCategories, visibleContent } from "./contents";
import { getProgress, type Progress } from "./progress";
import { contentItem } from "./cards";
import type { ContentItem, SearchResults } from "./types";

/**
 * `/search?q=…&scope=…`: full-text on the accent-free index, twenty per kind, one "best" pick. When
 * that finds nothing, the titles that look like the query (trigrams, `pg_trgm`): typos are forgiven.
 */
export const searchRoutes = new Hono<Env>();

const searchQuery = zValidator(
  "query",
  z.object({
    q: z.string().default(""),
    scope: z.enum(["all", "movies", "series", "live"], { error: "scope doit valoir all, movies, series ou live" }).default("all"),
  }),
  badQuery,
);
searchRoutes.get("/", searchQuery, async (c) => {
  const { q, scope } = c.req.valid("query");
  return json(await search(c.get("ctx"), q, scope));
});

/** Shortest query given to the typo-tolerant fallback. */
export const FUZZY_MIN_LENGTH = 3;
/** Shortest term searched as a prefix: « a:* » alone matches half the catalogue. A shorter one is a whole word. */
const PREFIX_MIN_LENGTH = 2;
/**
 * Comparing titles costs (accents, punctuation, similarity): a short query matches tens of thousands
 * of contents, so only the most voted ones are compared, from the prefixes and from the whole words
 * (a title equal to the query is made of its words, however little voted, as « Ma » among the « ma… »).
 */
export const SEARCH_CANDIDATES = 200;

/** A title as `similarityKey` writes it, in SQL: accent-free, lower case, punctuation as spaces. */
const titleKey = (col: unknown) =>
  sql`btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, coalesce(${col}, ''))), '[^a-z0-9]+', ' ', 'g'))`;

/**
 * Titles before everything else: a title equal to the query (punctuation, accents and case aside;
 * original and English titles too), then the titles closest to it, then popularity. The full-text
 * rank is left out: it weighs a title and a cast name alike. « I Robot » finds « I, Robot » first.
 */
export async function search(
  ctx: RestContext,
  query: string,
  scope: "all" | "movies" | "series" | "live",
  candidates = SEARCH_CANDIDATES,
): Promise<SearchResults> {
  const q = searchText(query.trim());
  if (!q) return { query, best: null, movies: [], series: [], live: [] };
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!terms.length) return { query, best: null, movies: [], series: [], live: [] };
  const word = (t: string) => t.replace(/'/g, "''");
  const prefixes = terms.map((t) => (t.length >= PREFIX_MIN_LENGTH ? `${word(t)}:*` : word(t))).join(" & ");
  const words = terms.map(word).join(" & ");
  const key = similarityKey(query);
  const t = schema.catalogContents;
  // Same expression as the `catalog_contents_titles_trgm_idx` index, or the planner cannot use it.
  const titles = sql`search_titles(${t.title}, ${t.originalTitle}, ${t.titleEn})`;
  const fields = {
    content: t,
    exact: sql<boolean>`(${titleKey(t.title)} = ${key} or ${titleKey(t.originalTitle)} = ${key} or ${titleKey(t.titleEn)} = ${key})`,
    closeness: sql<number>`word_similarity(${q}, ${titles})`,
  };
  const mostVoted = (kind: "vod" | "series" | "live", tsq: string) =>
    db
      .select({ id: t.id })
      .from(t)
      .where(and(visibleContent(ctx, kind), sql`${t.search} @@ to_tsquery('simple', ${tsq})`))
      .orderBy(sql`${t.voteCount} desc nulls last`, asc(t.id))
      .limit(candidates);
  const find = (kind: "vod" | "series" | "live") =>
    db
      .select(fields)
      .from(t)
      .where(
        prefixes === words
          ? sql`${t.id} in (${mostVoted(kind, words)})`
          : sql`${t.id} in ((${mostVoted(kind, prefixes)}) union (${mostVoted(kind, words)}))`,
      )
      .orderBy(desc(fields.exact), desc(fields.closeness), desc(t.voteCount), asc(t.title))
      .limit(20);
  const resembling = (kind: "vod" | "series" | "live") =>
    db
      .select(fields)
      .from(t)
      .where(and(visibleContent(ctx, kind), sql`${q} <% ${titles}`))
      .orderBy(desc(fields.exact), desc(fields.closeness), desc(t.voteCount), asc(t.title))
      .limit(20);
  const run = (query: typeof find) =>
    Promise.all([
      scope === "all" || scope === "movies" ? query("vod") : [],
      scope === "all" || scope === "series" ? query("series") : [],
      scope === "all" || scope === "live" ? query("live") : [],
    ]);
  let [movies, series, live] = await run(find);
  // Below three characters, trigrams match about anything.
  if (!movies.length && !series.length && !live.length && q.length >= FUZZY_MIN_LENGTH) [movies, series, live] = await run(resembling);
  const progress = await getProgress([...movies, ...series].map((r) => r.content.key));
  const cats = live.length ? new Map((await liveCategories()).map((c) => [c.xtreamId, c.name])) : new Map<string, string>();
  const categoryOf = (c: Content) => (c.categoryXtreamId && cats.get(c.categoryXtreamId)) || null;
  const items = (rows: typeof movies) => rows.map((r) => contentItem(ctx, r.content, progress.get(r.content.key)));
  // A channel: its logo for a poster, its category for facts.
  const l = live.map(({ content: c }) => ({ ...contentItem(ctx, c), facts: categoryOf(c) }));
  // The best across the three kinds: an equal title, then the closest one, then the most voted.
  const all = [...movies, ...series, ...live];
  const ranked = all
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        Number(b.r.exact) - Number(a.r.exact) ||
        b.r.closeness - a.r.closeness ||
        (b.r.content.voteCount ?? 0) - (a.r.content.voteCount ?? 0),
    );
  const top = ranked[0]?.r.content;
  return {
    query,
    best: top ? bestItem(ctx, top, progress.get(top.key), categoryOf(top)) : null,
    movies: items(movies),
    series: items(series),
    live: l,
  };
}

/** The best result, shown wide: its picture and logo, « Film · 2019 · Drame », its overview. */
function bestItem(ctx: RestContext, c: Content, progress: Progress | undefined, category: string | null): ContentItem {
  const facts =
    c.kind === "live"
      ? category
      : [c.kind === "series" ? "Série" : "Film", c.year ? String(c.year) : null, c.genres[0] ?? null].filter((t) => t !== null).join(" · ");
  return { ...contentItem(ctx, c, progress), facts, overview: c.overview };
}
