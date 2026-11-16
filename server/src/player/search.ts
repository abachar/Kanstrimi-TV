import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, sql, type SQL } from "drizzle-orm";
import { channelContent, db, schema, titleContent, type Content } from "@/db";
import { searchText, similarityKey } from "@/shared";
import type { Env, RestContext } from "./context";
import { badQuery, json } from "./http";
import { visibleChannel, visibleTitle } from "./contents";
import { getProgress, type Progress } from "./progress";
import { contentItem } from "./cards";
import { channelGroupName } from "./channels";
import type { ContentItem, SearchResults } from "./types";

/**
 * `/search?q=…&scope=…`: full-text on the accent-free index, movies, series and channels in one list ranked by
 * relevance, `SEARCH_RESULTS` at most. When that finds nothing, the titles that look like the query (trigrams,
 * `pg_trgm`): typos are forgiven.
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

/** The results of a search, every kind together. */
export const SEARCH_RESULTS = 40;
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
  if (!q) return { query, items: [] };
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!terms.length) return { query, items: [] };
  const word = (t: string) => t.replace(/'/g, "''");
  const prefixes = terms.map((t) => (t.length >= PREFIX_MIN_LENGTH ? `${word(t)}:*` : word(t))).join(" & ");
  const words = terms.map(word).join(" & ");
  const key = similarityKey(query);
  type SearchKind = "vod" | "series" | "live";
  const tt = schema.catalogTitles;
  const ch = schema.catalogChannels;
  /**
   * What a search reads of a kind: a title has three names and TMDB's votes, a channel its one name.
   * `names` is the expression of the table's trigram index (`catalog_titles_titles_trgm_idx`,
   * `catalog_channels_names_trgm_idx`), or the planner cannot use it.
   */
  const sourceOf = (kind: SearchKind) =>
    kind === "live"
      ? {
          table: ch,
          id: ch.id,
          search: ch.search,
          title: ch.name,
          votes: sql<number | null>`null::int`,
          visible: visibleChannel(ctx),
          names: sql`search_titles(${ch.name}, null, null)`,
          exact: sql<boolean>`${titleKey(ch.name)} = ${key}`,
          // The same fields as a title's, in the same order: one selection type for both.
          content: channelContent as unknown as typeof titleContent,
        }
      : {
          table: tt,
          id: tt.id,
          search: tt.search,
          title: tt.title,
          votes: sql<number | null>`${tt.voteCount}`,
          visible: visibleTitle(ctx, kind),
          names: sql`search_titles(${tt.title}, ${tt.originalTitle}, ${tt.titleEn})`,
          exact: sql<boolean>`(${titleKey(tt.title)} = ${key} or ${titleKey(tt.originalTitle)} = ${key} or ${titleKey(tt.titleEn)} = ${key})`,
          content: titleContent,
        };
  type Found = { content: Content; exact: boolean; closeness: number };
  const mostVoted = (s: ReturnType<typeof sourceOf>, tsq: string) =>
    db
      .select({ id: s.id })
      .from(s.table)
      .where(and(s.visible, sql`${s.search} @@ to_tsquery('simple', ${tsq})`))
      .orderBy(sql`${s.votes} desc nulls last`, asc(s.id))
      .limit(candidates);
  const rankedIn = (s: ReturnType<typeof sourceOf>, where: SQL): Promise<Found[]> => {
    const closeness = sql<number>`word_similarity(${q}, ${s.names})`;
    return db
      .select({ content: s.content, exact: s.exact, closeness })
      .from(s.table)
      .where(where)
      .orderBy(desc(s.exact), desc(closeness), sql`${s.votes} desc`, asc(s.title))
      .limit(SEARCH_RESULTS) as unknown as Promise<Found[]>;
  };
  const find = (kind: SearchKind) => {
    const s = sourceOf(kind);
    return rankedIn(
      s,
      prefixes === words
        ? sql`${s.id} in (${mostVoted(s, words)})`
        : sql`${s.id} in ((${mostVoted(s, prefixes)}) union (${mostVoted(s, words)}))`,
    );
  };
  const resembling = (kind: SearchKind) => {
    const s = sourceOf(kind);
    return rankedIn(s, and(s.visible, sql`${q} <% ${s.names}`)!);
  };
  const run = (query: typeof find) =>
    Promise.all([
      scope === "all" || scope === "movies" ? query("vod") : [],
      scope === "all" || scope === "series" ? query("series") : [],
      scope === "all" || scope === "live" ? query("live") : [],
    ]);
  let [movies, series, live] = await run(find);
  // Below three characters, trigrams match about anything.
  if (!movies.length && !series.length && !live.length && q.length >= FUZZY_MIN_LENGTH) [movies, series, live] = await run(resembling);
  // One list: an equal title, then the closest one, then the most voted, whatever the kind.
  const ranked = [...movies, ...series, ...live]
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        Number(b.r.exact) - Number(a.r.exact) ||
        b.r.closeness - a.r.closeness ||
        (b.r.content.voteCount ?? 0) - (a.r.content.voteCount ?? 0) ||
        a.i - b.i,
    )
    .slice(0, SEARCH_RESULTS)
    .map(({ r }) => r.content);
  const progress = await getProgress(
    ctx.profile.id,
    ranked.filter((c) => c.kind !== "live").map((c) => c.key),
  );
  return { query, items: ranked.map((c) => resultItem(ctx, c, progress.get(c.key))) };
}

/** A result as the grid shows it: a series says so (« Série · 2025 · ★ 8.3 »), a channel gives its group. */
function resultItem(ctx: RestContext, c: Content, progress: Progress | undefined): ContentItem {
  const item = contentItem(ctx, c, progress);
  if (c.kind === "live") return { ...item, facts: channelGroupName(c) };
  if (c.kind === "series") return { ...item, facts: ["Série", item.facts].filter((t) => t !== null).join(" · ") };
  return item;
}
