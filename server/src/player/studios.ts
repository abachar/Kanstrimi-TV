import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ofStudio, parseStudioRef, studioColumn, type StudioKind } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { byRelease, visibleContent } from "./contents";
import { imageUrl } from "./cards";
import type { StudioWire } from "./types";

/** `/movies/studios` or `/series/studios`: the hubs with something to show in that tab. */
export function studioRoutes(kind: "vod" | "series") {
  const routes = new Hono<Env>();
  routes.get("/", async (c) => json(await studiosOf(c.get("ctx"), kind)));
  return routes;
}

export async function studiosOf(ctx: RestContext, kind: "vod" | "series"): Promise<StudioWire[]> {
  const rows = await db.execute<{
    kind: StudioKind;
    tmdb_id: number;
    name: string;
    logo_path: string | null;
    n: number;
    backdrop_path: string | null;
  }>(sql`
    select s.kind, s.tmdb_id, s.name, s.logo_path, n.n, b.backdrop_path
    from ${schema.curationStudios} s
    cross join lateral (
      select count(*)::int as n from ${schema.catalogContents}
      where ${visibleContent(ctx, kind)} and ${ofStudio("s")}
    ) n
    left join lateral (
      select backdrop_path from ${schema.catalogContents}
      where ${visibleContent(ctx, kind)} and ${ofStudio("s")} and backdrop_path is not null
      order by ${byRelease} desc, id desc limit 1
    ) b on true
    where n.n > 0 order by s.position, s.id`);
  return rows.map((r) => ({
    id: `${r.kind}:${r.tmdb_id}`,
    name: r.name,
    logo: imageUrl(ctx.baseUrl, "w300", r.logo_path) || null,
    backdrop: imageUrl(ctx.baseUrl, "w1280", r.backdrop_path) || null,
    count: r.n,
  }));
}

/** `company:3` → the filter of `/movies?studio=…`; null when malformed. */
export function studioFilter(id: string) {
  const ref = parseStudioRef(id);
  return ref ? sql`${studioColumn(ref.kind)} @> array[${ref.tmdbId}]::int[]` : null;
}
