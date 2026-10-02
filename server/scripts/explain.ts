// Dev helper: replay the TMDB matching for a name (+ optional upstream tmdb id), without writing.
// usage: node --import tsx --env-file-if-exists=.env scripts/explain.ts <admin password> "<name>" [tmdb_id] [vod|series]
import { verify } from "@/config";
import { getTmdbClient, namesOf } from "@/providers/tmdb";
import { cleanTitle, explainMatch } from "@/catalog";
const [, , pw, name, tmdb, kind = "vod"] = process.argv;
if (!(await verify(pw ?? ""))) {
  console.error("mot de passe incorrect");
  process.exit(1);
}
const client = await getTmdbClient();
if (!client) {
  console.error("clé TMDB absente");
  process.exit(1);
}
const ct = cleanTitle(name);
const e = await explainMatch(client, {
  id: 0,
  kind: kind as "vod" | "series",
  name,
  cleanTitle: ct.title,
  year: ct.year ?? null,
  raw: tmdb ? { tmdb } : {},
});
console.log(
  JSON.stringify(
    {
      ...e,
      searches: e.searches.map((s) => ({
        withYear: s.withYear,
        candidates: s.candidates.slice(0, 4).map((c) => ({
          id: c.result.id,
          title: c.result.title ?? c.result.name,
          original: c.result.original_title ?? c.result.original_name,
          year: c.year,
          sim: +c.similarity.toFixed(2),
          score: +c.score.toFixed(2),
        })),
      })),
    },
    null,
    1,
  ),
);
if (tmdb) {
  const d = await (kind === "vod" ? client.movie(Number(tmdb)) : client.tv(Number(tmdb)));
  console.log("names:", namesOf(d), "| original_language:", d.original_language);
}
process.exit(0);
