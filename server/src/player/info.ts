import { Hono } from "hono";
import { db, schema, variants, type Kind } from "@/db";
import { and, inArray, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import pkg from "../../package.json";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { servedVariant, visibleChannel, visibleTitle } from "./contents";
import { sortLanguages } from "./versions";
import { profileWire } from "./profiles";
import type { ServerInfo } from "./types";

export const infoRoutes = new Hono<Env>();
infoRoutes.get("/", async (c) => json(await serverInfo(c.get("ctx"))));

export async function serverInfo(ctx: RestContext): Promise<ServerInfo> {
  const [counts, s, rate, langs] = await Promise.all([
    Promise.all([
      db
        .select({ kind: schema.catalogTitles.kind, n: sql<number>`count(*)::int` })
        .from(schema.catalogTitles)
        .where(visibleTitle(ctx))
        .groupBy(schema.catalogTitles.kind),
      db.select({ kind: sql<Kind>`'live'`, n: sql<number>`count(*)::int` }).from(schema.catalogChannels).where(visibleChannel(ctx)),
    ]).then((r) => r.flat()),
    getSettings(),
    db
      .select({
        matched: sql<number>`count(*) filter (where ${variants.matchStatus} in ('matched','manual'))::int`,
        decided: sql<number>`count(*) filter (where ${variants.matchStatus} in ('matched','manual','unmatched'))::int`,
      })
      .from(variants)
      .where(and(inArray(variants.kind, ["vod", "series"]), servedVariant(ctx))),
    db.execute<{ l: string }>(sql`select distinct unnest(languages) as l from ${schema.catalogTitles} where ${visibleTitle(ctx)}`),
  ]);
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  return {
    server_version: pkg.version,
    counts: { movies: n("vod"), series: n("series"), channels: n("live") },
    last_import: s.last_sync_at || null,
    tmdb_rate: rate[0].decided ? Math.round((rate[0].matched / rate[0].decided) * 100) / 100 : null,
    catalog_languages: sortLanguages(
      langs.map((r) => r.l),
      ctx.languageOrder.vod,
    ),
    profile: profileWire(ctx, ctx.profile),
  };
}
