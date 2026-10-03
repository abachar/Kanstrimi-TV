import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import type { Exec } from "./search";
import { catalogRows, listContents, listSagaWires, sagaSheet, studiosOf, type RestContext, type SagaWire, type StudioWire } from "@/player";

/**
 * The « Catalogue » view of films and series, shelf by shelf, through the app's own functions:
 * the order and the filters are the app's, the rows the contents behind its cards.
 * A shelf id: `top10`, `recent`, `genre:<slug>`, `studios`, `studio:<id>`, `sagas`, `saga:<id>`.
 */

export type Shelf = { id: string; name: string; total: number };

/** The shelves of the screen in the app's order: studios and sagas after « Nouveautés », or the first shelf. */
export async function shelvesOf(ctx: RestContext, kind: "vod" | "series"): Promise<Shelf[]> {
  const [rows, studios, sagas] = await Promise.all([
    catalogRows(ctx, kind),
    studiosOf(ctx, kind),
    kind === "vod" ? listSagaWires(ctx, { limit: 1 }) : null,
  ]);
  const shelves: Shelf[] = [];
  const anchor = rows.find((r) => r.id === "recent")?.id ?? rows[0]?.id;
  for (const r of rows) {
    shelves.push({ id: r.id === "top10" || r.id === "recent" ? r.id : `genre:${r.id}`, name: r.name, total: r.total });
    if (r.id !== anchor) continue;
    if (studios.length) shelves.push({ id: "studios", name: "Studios", total: studios.length });
    if (sagas?.total) shelves.push({ id: "sagas", name: "Sagas", total: sagas.total });
  }
  return shelves;
}

/** The contents behind cards, in the cards' order. */
async function contentsOf(keys: string[]): Promise<Content[]> {
  if (!keys.length) return [];
  const rows = await db.select().from(schema.catalogContents).where(inArray(schema.catalogContents.key, keys));
  const byKey = new Map(rows.map((c) => [c.key, c]));
  return keys.flatMap((k) => byKey.get(k) ?? []);
}

export type ShelfPage =
  | { type: "contents"; rows: Content[]; next: string | null }
  | { type: "studios"; studios: StudioWire[] }
  | { type: "sagas"; sagas: SagaWire[]; next: string | null };

const PAGE = 50;

/** One page of a shelf; `cursor` continues it. Null for an unknown shelf. */
export async function shelfPage(ctx: RestContext, kind: "vod" | "series", shelf: string, cursor?: string): Promise<ShelfPage | null> {
  const list = async (q: { genre?: string; studio?: string }): Promise<ShelfPage> => {
    const page = await listContents(ctx, kind, { ...q, cursor, limit: PAGE });
    return { type: "contents", rows: await contentsOf(page.items.map((c) => c.id)), next: page.next_cursor };
  };
  if (shelf === "top10") {
    const top = (await catalogRows(ctx, kind)).find((r) => r.id === "top10");
    const cards = top ? ("movies" in top ? top.movies : top.series) : [];
    return { type: "contents", rows: await contentsOf(cards.map((c) => c.id)), next: null };
  }
  if (shelf === "recent") return list({ genre: "recent" });
  if (shelf.startsWith("genre:")) return list({ genre: shelf.slice(6) });
  if (shelf === "studios") return { type: "studios", studios: await studiosOf(ctx, kind) };
  if (shelf.startsWith("studio:")) return list({ studio: shelf.slice(7) });
  if (shelf === "sagas" && kind === "vod") {
    const page = await listSagaWires(ctx, { cursor, limit: PAGE });
    return { type: "sagas", sagas: page.items, next: page.next_cursor };
  }
  if (shelf.startsWith("saga:") && kind === "vod") {
    const saga = await sagaSheet(ctx, shelf); // a saga id is already « saga:<id> »
    return saga ? { type: "contents", rows: await contentsOf(saga.movies.map((m) => m.id)), next: null } : null;
  }
  return null;
}

export const FOUND_PAGE = 50;

/** The « Catalogue » search: the contents with at least one variant meeting the query, latest first. */
export async function searchContents(ex: Exec, kind: "live" | "vod" | "series", where: SQL, offset: number) {
  const cond = and(
    eq(schema.catalogContents.kind, kind),
    sql`exists (select 1 from ${schema.catalogVariants} where ${schema.catalogVariants.contentId} = ${schema.catalogContents.id} and ${where})`,
  );
  const [[{ n }], rows] = await Promise.all([
    ex.select({ n: sql<number>`count(*)::int` }).from(schema.catalogContents).where(cond),
    ex
      .select()
      .from(schema.catalogContents)
      .where(cond)
      .orderBy(desc(schema.catalogContents.addedAt), desc(schema.catalogContents.id))
      .limit(FOUND_PAGE)
      .offset(offset),
  ]);
  return { rows, total: n };
}
