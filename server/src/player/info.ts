import { Hono } from "hono";
import { db, schema } from "@/db";
import { and, inArray, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import pkg from "../../package.json";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { servedVariant, visibleContent } from "./contents";
import { sortLanguages } from "./versions";
import type { ServerInfo } from "./types";

export const infoRoutes = new Hono<Env>();
infoRoutes.get("/", async (c) => json(await serverInfo(c.get("ctx"))));

export async function serverInfo(ctx: RestContext): Promise<ServerInfo> {
  const [counts, s, rate, langs] = await Promise.all([
    db
      .select({ kind: schema.catalogContents.kind, n: sql<number>`count(*)::int` })
      .from(schema.catalogContents)
      .where(visibleContent(ctx))
      .groupBy(schema.catalogContents.kind),
    getSettings(),
    db
      .select({
        matched: sql<number>`count(*) filter (where ${schema.catalogVariants.matchStatus} in ('matched','manual'))::int`,
        decided: sql<number>`count(*) filter (where ${schema.catalogVariants.matchStatus} in ('matched','manual','unmatched'))::int`,
      })
      .from(schema.catalogVariants)
      .where(and(inArray(schema.catalogVariants.kind, ["vod", "series"]), servedVariant(ctx))),
    db.execute<{ l: string }>(
      sql`select distinct unnest(languages) as l from ${schema.catalogContents} where ${visibleContent(ctx)} and kind <> 'live'`,
    ),
  ]);
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  return {
    server_version: pkg.version,
    counts: { movies: n("vod"), series: n("series"), channels: n("live") },
    last_import: s.last_sync_at || null,
    tmdb_rate: rate[0].decided ? Math.round((rate[0].matched / rate[0].decided) * 100) / 100 : null,
    catalog_languages: sortLanguages(langs.map((r) => r.l)),
  };
}
