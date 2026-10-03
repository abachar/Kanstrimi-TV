import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Env, RestContext } from "./context";
import { BadRequest, badQuery, fail, json } from "./http";
import { visibleContent } from "./contents";
import { getProgress } from "./progress";
import { contentItem, filmCount, imageUrl } from "./cards";
import { decodeCursor, encodeCursor } from "./lists";
import type { ContentItem, SagaPage, SagaRef, SagaSheet, SagaWire } from "./types";

/**
 * `/movies/sagas`: the TMDB collections of the catalogue. A saga exists for the app only with at
 * least two visible movies; it is dated by its latest release, which orders the list.
 */
export const sagaRoutes = new Hono<Env>();

const MIN_MOVIES = 2,
  PAGE_DEFAULT = 30,
  PAGE_MAX = 100;
const NO_RELEASE = "0001-01-01";
const sagaKey = (id: number) => `saga:${id}`;
const parseSagaKey = (key: string) => (/^saga:\d+$/.test(key) ? Number(key.slice(5)) : null);

type SagaRow = { id: number; name: string; poster: string | null; backdrop: string | null; n: number; latest: string };

/** One row per saga over the visible movies; `only` narrows to one saga. */
const sagasOf = (ctx: RestContext, only?: number) => sql`
  select saga_id as id, min(saga_name) as name, min(saga_poster_path) as poster, min(saga_backdrop_path) as backdrop,
    count(*)::int as n, max(coalesce(release_date, ${NO_RELEASE}::date))::text as latest
  from ${schema.catalogContents}
  where ${visibleContent(ctx, "vod")} and saga_id is not null ${only === undefined ? sql`` : sql`and saga_id = ${only}`}
  group by saga_id having count(*) >= ${MIN_MOVIES}`;

const sagaWire = (ctx: RestContext, r: SagaRow): SagaWire => ({
  id: sagaKey(r.id),
  name: r.name,
  count: r.n,
  poster: imageUrl(ctx.baseUrl, "w500", r.poster) || null,
  backdrop: imageUrl(ctx.baseUrl, "w1280", r.backdrop) || null,
});

/** A saga in a list: its poster and its number of movies, drawn like a title's year. */
const sagaItem = (w: SagaWire): ContentItem => ({
  id: w.id,
  kind: "saga",
  title: w.name,
  logo: null,
  poster: w.poster,
  picture: w.backdrop,
  facts: filmCount(w.count),
  badges: [],
  hint: null,
  progress: null,
  watched: false,
  caption: null,
  overview: null,
});

const sagaQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number({ error: "limit doit être un entier positif" })
    .int("limit doit être un entier positif")
    .positive("limit doit être un entier positif")
    .optional(),
});
export type SagaQuery = z.infer<typeof sagaQuery>;

sagaRoutes.get("/", zValidator("query", sagaQuery, badQuery), async (c) => json(await listSagas(c.get("ctx"), c.req.valid("query"))));
sagaRoutes.get("/:id", async (c) => {
  const sheet = await sagaSheet(c.get("ctx"), c.req.param("id"));
  return sheet ? json(sheet) : fail("not_found", "Saga introuvable");
});

export async function listSagas(ctx: RestContext, q: SagaQuery): Promise<SagaPage> {
  const page = await listSagaWires(ctx, q);
  return { ...page, items: page.items.map(sagaItem) };
}

/** A page of sagas with their name and count: the app's list, and the admin's folds. */
export async function listSagaWires(
  ctx: RestContext,
  q: SagaQuery,
): Promise<{ items: SagaWire[]; next_cursor: string | null; total: number }> {
  const limit = Math.min(PAGE_MAX, q.limit ?? PAGE_DEFAULT);
  let after = sql``;
  if (q.cursor) {
    const cur = decodeCursor(q.cursor);
    if (!cur || typeof cur[0] !== "string") throw new BadRequest("cursor invalide");
    after = sql`where (s.latest, s.id) < (${cur[0]}, ${cur[1]})`;
  }
  // One aggregation: the total is counted over every saga before the cursor narrows them.
  const rows = await db.execute<SagaRow & { total: number }>(
    sql`select * from (select s.*, (count(*) over ())::int as total from (${sagasOf(ctx)}) s) s ${after} order by s.latest desc, s.id desc limit ${limit + 1}`,
  );
  const total =
    rows[0]?.total ?? (await db.execute<{ total: number }>(sql`select count(*)::int as total from (${sagasOf(ctx)}) s`))[0].total;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => sagaWire(ctx, r)),
    next_cursor: rows.length > limit && last ? encodeCursor(last.latest, last.id) : null,
    total,
  };
}

export async function sagaSheet(ctx: RestContext, key: string): Promise<SagaSheet | null> {
  const id = parseSagaKey(key);
  if (id === null) return null;
  const [saga] = await db.execute<SagaRow>(sagasOf(ctx, id));
  if (!saga) return null;
  const movies = await db
    .select()
    .from(schema.catalogContents)
    .where(and(visibleContent(ctx, "vod"), eq(schema.catalogContents.sagaId, id)))
    .orderBy(desc(sql`coalesce(${schema.catalogContents.releaseDate}, ${NO_RELEASE}::date)`), desc(schema.catalogContents.id));
  const progress = await getProgress(movies.map((m) => m.key));
  return {
    ...sagaWire(ctx, saga),
    heading: "SAGA",
    facts: filmCount(saga.n),
    movies: movies.map((m) => contentItem(ctx, m, progress.get(m.key))),
  };
}

/** The saga line of a movie sheet, when its saga has enough visible movies. */
export async function sagaRefOf(ctx: RestContext, sagaId: number | null): Promise<SagaRef | undefined> {
  if (sagaId === null) return undefined;
  const [saga] = await db.execute<SagaRow>(sagasOf(ctx, sagaId));
  return saga ? { id: sagaKey(saga.id), name: saga.name, count: saga.n } : undefined;
}
