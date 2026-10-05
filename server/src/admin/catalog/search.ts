import { sql, type SQL } from "drizzle-orm";
import { db, type Kind } from "@/db";
import { checkRegexes, compileQuery, QueryError } from "@/catalog";
import { getSettings } from "@/config";

/**
 * The admin's searches in the filter language: the query compiled once per request, then run with a
 * time limit, its errors turned into a sentence for the page instead of a 500.
 */

export type Search = { where: SQL | null; error: string | null };
/** What a search runs on: the database, or the transaction that carries its time limit. */
export type Exec = Pick<typeof db, "select" | "execute">;

const col = (at: number) => `colonne ${at + 1}`;

/** An empty query searches nothing: `where` null, no error. */
export async function compileSearch(kind: Kind, q: string): Promise<Search> {
  if (!q.trim()) return { where: null, error: null };
  try {
    const where = compileQuery(q, { kind, lang: (await getSettings()).tmdb_language })?.where ?? null;
    await checkRegexes(q);
    return { where, error: null };
  } catch (e) {
    if (e instanceof QueryError) return { where: null, error: `${e.message} (${col(e.at)})` };
    throw e;
  }
}

/** A regex can make Postgres run long, and its regexes are not JavaScript's: both end as a message. */
export async function runSearch<T>(fn: (ex: Exec) => Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return {
      value: await db.transaction(async (tx) => {
        await tx.execute(sql`set local statement_timeout = '10s'`);
        return fn(tx);
      }),
    };
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string; message?: string } };
    const code = err.code ?? err.cause?.code;
    if (code === "57014") return { error: "Recherche trop longue (plus de 10 s) : la préciser" };
    if (code === "2201B") return { error: `Expression régulière refusée par Postgres : ${err.cause?.message ?? (e as Error).message}` };
    throw e;
  }
}
