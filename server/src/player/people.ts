import { Hono } from "hono";
import { and, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { visibleContent } from "./contents";
import { getProgress } from "./progress";
import { gridCard, imageUrl } from "./cards";
import type { PersonSheet } from "./types";

/**
 * `/people/{id}`: an actor of the cast kept on the contents (the first ten of the TMDB credits),
 * with their visible titles. No table of people: the GIN index on `cast` finds the titles.
 */
export const peopleRoutes = new Hono<Env>();

const NO_RELEASE = "0001-01-01";
const parsePersonKey = (key: string) => (/^person:\d+$/.test(key) ? Number(key.slice(7)) : null);

peopleRoutes.get("/:id", async (c) => {
  const sheet = await personSheet(c.get("ctx"), c.req.param("id"));
  return sheet ? json(sheet) : fail("not_found", "Personne introuvable");
});

export async function personSheet(ctx: RestContext, key: string): Promise<PersonSheet | null> {
  const id = parsePersonKey(key);
  if (id === null) return null;
  const rows = await db
    .select()
    .from(schema.catalogContents)
    .where(
      and(
        visibleContent(ctx),
        inArray(schema.catalogContents.kind, ["vod", "series"]),
        sql`${schema.catalogContents.cast} @> ${JSON.stringify([{ id }])}::jsonb`,
      ),
    )
    .orderBy(desc(sql`coalesce(${schema.catalogContents.releaseDate}, ${NO_RELEASE}::date)`), desc(schema.catalogContents.id));
  if (rows.length === 0) return null;
  const me = rows[0].cast?.find((p) => p.id === id);
  const progress = await getProgress(rows.map((r) => r.key));
  const cards = (kind: "vod" | "series") => rows.filter((r) => r.kind === kind).map((r) => gridCard(ctx, r, progress.get(r.key)));
  return {
    id: `person:${id}`,
    name: me?.name ?? "",
    photo: imageUrl(ctx.baseUrl, "w185", me?.profile) || null,
    movies: cards("vod"),
    series: cards("series"),
  };
}
