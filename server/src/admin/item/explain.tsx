import type { MatchExplanation } from "@/providers/tmdb";
import { tmdbMediaType } from "@/db";

const pct = (n: number) => `${Math.round(n * 100)} %`;

/** The matching replayed step by step, under "Pourquoi ce résultat ?". */
export function ExplainView({ e, kind }: { e: MatchExplanation; kind: "vod" | "series" }) {
  const url = (id: number) => `https://www.themoviedb.org/${tmdbMediaType(kind)}/${id}`;
  return (
    <div class="small">
      <p class="mb-1">
        Titre cherché : <strong>{e.cleaned.title}</strong>
        {e.cleaned.year ? ` (${e.cleaned.year})` : " (sans année)"} · seuil {pct(e.threshold)}
      </p>
      {e.provided && (
        <p class="mb-1">
          Identifiant amont{" "}
          <a href={url(e.provided.id)} target="_blank" rel="noreferrer">
            #{e.provided.id}
          </a>{" "}
          :{" "}
          {e.provided.found ? (
            <>
              « {e.provided.title} »{e.provided.year ? ` (${e.provided.year})` : ""}, similarité {pct(e.provided.similarity)} →{" "}
              <span class={e.provided.accepted ? "text-success" : "text-danger"}>
                {e.provided.accepted ? `accepté (${e.provided.evidence?.reasons.join(", ")})` : "rejeté"}
              </span>
              {e.provided.evidence && (
                <span class="text-secondary">
                  {" "}
                  · année {e.provided.evidence.yearOk === null ? "inconnue" : e.provided.evidence.yearOk ? "compatible" : "différente"},{" "}
                  {e.provided.evidence.castOverlap} acteur(s) en commun, réalisateur{" "}
                  {e.provided.evidence.directorMatch ? "identique" : "différent ou absent"}, image{" "}
                  {e.provided.evidence.imageMatch ? "identique" : "différente"}, bande-annonce{" "}
                  {e.provided.evidence.trailerMatch ? "identique" : "différente"}
                </span>
              )}
            </>
          ) : (
            <span class="text-danger">inconnu de TMDB</span>
          )}
        </p>
      )}
      {e.searches.map((s) => (
        <div class="mb-1">
          Recherche {s.withYear ? `avec l'année ${s.withYear}` : "sans année"}
          {s.adult ? ", contenus adultes inclus" : ""} : {s.candidates.length ? "" : <span class="text-secondary">aucun résultat</span>}
          {s.candidates.length > 0 && (
            <table class="table table-sm mb-1">
              <thead>
                <tr>
                  <th>Résultat</th>
                  <th>Année</th>
                  <th>Similarité</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {s.candidates.map((c) => (
                  <tr class={c.score >= e.threshold ? "table-success" : ""}>
                    <td>
                      <a href={url(c.result.id)} target="_blank" rel="noreferrer">
                        {c.result.title ?? c.result.name}
                      </a>
                      {(c.result.original_title ?? c.result.original_name) &&
                      (c.result.original_title ?? c.result.original_name) !== (c.result.title ?? c.result.name) ? (
                        <span class="text-secondary"> ({c.result.original_title ?? c.result.original_name})</span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td>{c.year ?? "—"}</td>
                    <td>{pct(c.similarity)}</td>
                    <td>{pct(c.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {e.alternative && (
        <p class="mb-1">
          Meilleur candidat{" "}
          <a href={url(e.alternative.id)} target="_blank" rel="noreferrer">
            #{e.alternative.id}
          </a>{" "}
          rejugé sur tous ses titres ({e.alternative.names.slice(0, 6).join(" · ")}
          {e.alternative.names.length > 6 ? " · …" : ""}) : similarité {pct(e.alternative.similarity)}
          {e.alternative.evidence?.accepted
            ? ` → accepté (${e.alternative.evidence.reasons.join(", ")})`
            : e.alternative.evidence
              ? ` · ${e.alternative.evidence.castOverlap} acteur(s) en commun`
              : ""}
        </p>
      )}
      <p class="mb-0">
        Verdict :{" "}
        <strong class={e.verdict.status === "matched" ? "text-success" : "text-danger"}>
          {e.verdict.status === "matched" ? `associé à #${e.verdict.tmdbId}` : "introuvable"}
        </strong>
        {e.verdict.via === "search"
          ? ` par recherche, score ${pct(e.verdict.score)}`
          : e.verdict.via === "alternative"
            ? ` par un titre alternatif, similarité ${pct(e.verdict.score)}`
            : e.verdict.via === "id"
              ? " par l'identifiant amont"
              : e.verdict.score
                ? ` (meilleur score ${pct(e.verdict.score)})`
                : ""}
      </p>
    </div>
  );
}
