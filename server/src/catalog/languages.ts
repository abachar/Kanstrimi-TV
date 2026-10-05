import { and, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, servedLanguages, setSettings } from "@/config";

/**
 * The served languages of films and series (`served_languages`): a variant in another one is hidden
 * (`hidden_by_language`). Written by the grouping before its aggregates, which count only what is
 * served: a film offered in Italian only disappears, one offered in French too loses its Italian
 * version. An empty setting serves every language, and a variant whose name gives none is served.
 * Channels are left out: their « language » is their market's, the rules choose them.
 */
export async function applyServedLanguages(): Promise<{ not_served: number }> {
  const served = servedLanguages(await getSettings());
  const v = schema.catalogVariants;
  const hidden = served.length
    ? sql`${v.kind} <> 'live' and ${v.lang} is not null and not (${v.lang} = any(${`{${served.join(",")}}`}::text[]))`
    : sql`false`;
  await db.execute(sql`update ${v} set hidden_by_language = not hidden_by_language where hidden_by_language is distinct from (${hidden})`);
  await setSettings({ languages_pending: "" });
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(v).where(sql`${v.hiddenByLanguage}`);
  return { not_served: r.n };
}

/**
 * Saves the served languages, among the catalogue's own, at least one. Like a rule, it applies at the next
 * grouping (`languages_pending` says the catalogue lags behind). Returns those kept, empty when none was valid.
 */
export async function saveServedLanguages(langs: string[]): Promise<string[]> {
  const known = new Set((await languagesOfCatalogue()).map((l) => l.lang));
  const kept = [...new Set(langs)].filter((l) => known.has(l));
  if (kept.length) await setSettings({ served_languages: kept.join(","), languages_pending: "1" });
  return kept;
}

export const languagesPending = async () => (await getSettings()).languages_pending === "1";

/** The languages of the films and series of the catalogue, the most frequent first, for the settings page. */
export function languagesOfCatalogue(): Promise<{ lang: string; variants: number }[]> {
  const v = schema.catalogVariants;
  return db
    .select({ lang: v.lang, variants: sql<number>`count(*)::int` })
    .from(v)
    .where(and(inArray(v.kind, ["vod", "series"]), sql`${v.lang} is not null`))
    .groupBy(v.lang)
    .orderBy(sql`count(*) desc`) as Promise<{ lang: string; variants: number }[]>;
}
