import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchText } from "@/shared";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { liveCategories, visibleContent } from "./contents";
import { getProgress } from "./progress";
import { baseCard, gridCard } from "./cards";
import type { Card, SearchResults } from "./types";

/** `/search?q=…&scope=…`: full-text on the accent-free index, twenty per kind, one "best" pick. */
export const searchRoutes = new Hono<Env>();

const searchQuery = zValidator(
  "query",
  z.object({ q: z.string().default(""), scope: z.enum(["all", "movies", "series", "live"]).default("all") }),
  (r) => {
    if (!r.success) return fail("bad_request", "scope doit valoir all, movies, series ou live");
  },
);
searchRoutes.get("/", searchQuery, async (c) => {
  const { q, scope } = c.req.valid("query");
  return json(await search(c.get("ctx"), q, scope));
});

export async function search(ctx: RestContext, query: string, scope: "all" | "movies" | "series" | "live"): Promise<SearchResults> {
  const q = searchText(query.trim());
  if (!q) return { query, best: null, movies: [], series: [], live: [] };
  const terms = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!terms.length) return { query, best: null, movies: [], series: [], live: [] };
  const tsq = terms.map((t) => `${t.replace(/'/g, "''")}:*`).join(" & ");
  const rank = sql`ts_rank(${schema.contents.search}, to_tsquery('simple', ${tsq}))`;
  const find = (kind: "vod" | "series" | "live") =>
    db
      .select()
      .from(schema.contents)
      .where(and(visibleContent(ctx, kind), sql`${schema.contents.search} @@ to_tsquery('simple', ${tsq})`))
      .orderBy(desc(rank), desc(schema.contents.voteCount), asc(schema.contents.title))
      .limit(20);
  const [movies, series, live] = await Promise.all([
    scope === "all" || scope === "movies" ? find("vod") : [],
    scope === "all" || scope === "series" ? find("series") : [],
    scope === "all" || scope === "live" ? find("live") : [],
  ]);
  const progress = await getProgress([...movies, ...series].map((c) => c.key));
  const cats = live.length ? new Map((await liveCategories()).map((c) => [c.xtreamId, c.name])) : new Map<string, string>();
  const m = movies.map((c) => gridCard(ctx, c, progress.get(c.key)));
  const s = series.map((c) => gridCard(ctx, c, progress.get(c.key)));
  const l = live.map((c) => ({
    ...baseCard(ctx, c),
    genres: c.categoryXtreamId && cats.get(c.categoryXtreamId) ? [cats.get(c.categoryXtreamId)!] : [],
  }));
  const all = [...m, ...s, ...l];
  const starts = (c: Card) => searchText(c.title).startsWith(q);
  const best = all.find(starts) ?? all[0] ?? null;
  return { query, best, movies: m, series: s, live: l };
}
