import { Hono } from "hono";
import { db, schema, visibleItem } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import pkg from "../../package.json";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { visibleContent } from "./contents";
import { DEFAULT_LANGUAGE_ORDER, sortLanguages } from "./versions";
import type { ServerInfo } from "./types";

export const infoRoutes = new Hono<Env>();
infoRoutes.get("/", async (c) => json(await serverInfo(c.get("ctx"))));

export async function serverInfo(ctx: RestContext): Promise<ServerInfo> {
  const [counts, s, rate, langs] = await Promise.all([
    db
      .select({ kind: schema.contents.kind, n: sql<number>`count(*)::int` })
      .from(schema.contents)
      .where(visibleContent(ctx))
      .groupBy(schema.contents.kind),
    getSettings(),
    db
      .select({
        matched: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual'))::int`,
        decided: sql<number>`count(*) filter (where ${schema.items.matchStatus} in ('matched','manual','unmatched'))::int`,
      })
      .from(schema.items)
      .where(and(inArray(schema.items.kind, ["vod", "series"]), visibleItem, ctx.serveAdult ? undefined : eq(schema.items.adult, false))),
    db.execute<{ l: string }>(
      sql`select distinct unnest(languages) as l from ${schema.contents} where ${visibleContent(ctx)} and kind <> 'live'`,
    ),
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
