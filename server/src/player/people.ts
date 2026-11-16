import { Hono } from "hono";
import { and, desc, inArray, sql } from "drizzle-orm";
import { db, schema, titleContent } from "@/db";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { byRelease, visibleTitle } from "./contents";
import { getProgress } from "./progress";
import { contentItem, imageUrl } from "./cards";
import type { PersonSheet } from "./types";

/**
 * `/people/{id}`: an actor of the cast kept on the contents (the first ten of the TMDB credits),
 * with their visible titles. No table of people: the GIN index on `cast` finds the titles.
 */
export const peopleRoutes = new Hono<Env>();

const parsePersonKey = (key: string) => (/^person:\d+$/.test(key) ? Number(key.slice(7)) : null);

peopleRoutes.get("/:id", async (c) => {
  const sheet = await personSheet(c.get("ctx"), c.req.param("id"));
  return sheet ? json(sheet) : fail("not_found", "Personne introuvable");
});

export async function personSheet(ctx: RestContext, key: string): Promise<PersonSheet | null> {
  const id = parsePersonKey(key);
  if (id === null) return null;
  const rows = await db
    .select(titleContent)
    .from(schema.catalogTitles)
    .where(
      and(
        visibleTitle(ctx),
        inArray(schema.catalogTitles.kind, ["vod", "series"]),
        sql`${schema.catalogTitles.cast} @> ${JSON.stringify([{ id }])}::jsonb`,
      ),
    )
    .orderBy(desc(byRelease), desc(schema.catalogTitles.id));
  if (rows.length === 0) return null;
  const me = rows[0].cast?.find((p) => p.id === id);
  const progress = await getProgress(
    ctx.profile.id,
    rows.map((r) => r.key),
  );
  const cards = (kind: "vod" | "series") => rows.filter((r) => r.kind === kind).map((r) => contentItem(ctx, r, progress.get(r.key)));
  return {
    id: `person:${id}`,
    name: me?.name ?? "",
    photo: imageUrl(ctx.baseUrl, "w185", me?.profile) || null,
    facts: rows.length > 1 ? `${rows.length} titres` : `${rows.length} titre`,
    movies: cards("vod"),
    series: cards("series"),
  };
}
