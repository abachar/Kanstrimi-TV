import type { Item, Category, Content } from "@/db/schema";
import type { MatchExplanation } from "@/lib/tmdb/enrich";
import { parseName, parseCategory } from "@/lib/grouping/tags";
import { TmdbCell, VisibilityToggle, type CatalogQuery } from "./views";
import { fmt } from "./layout";

const Row = ({ k, v }: { k: string; v: unknown }) => (
  <tr><th class="text-secondary fw-normal text-nowrap pe-3" style="width: 14rem">{k}</th><td class="text-break">{v === null || v === undefined || v === "" ? <span class="text-secondary">—</span> : Array.isArray(v) ? v.join(", ") : String(v instanceof Date ? v.toLocaleString("fr-FR") : v)}</td></tr>
);
const Table = ({ title, rows, extra }: { title: string; rows: [string, unknown][]; extra?: unknown }) => (
  <div class="card mb-3"><div class="card-header fw-semibold">{title}{extra && <small class="text-secondary ms-2">{extra}</small>}</div>
    <table class="table table-sm mb-0"><tbody>{rows.map(([k, v]) => <Row k={k} v={v} />)}</tbody></table></div>
);

const MATCH: Record<string, string> = { matched: "associé", manual: "manuel", unmatched: "introuvable", pending: "en attente", skipped: "sans objet" };

/** Everything the server knows about one entry: the row, what the parser makes of it, its category, its content, its TMDB sheet. */
export function ItemView({ it, cat, content, siblings, tmdb, tmdbLang }: {
  it: Item; cat: Category | null; content: Content | null; siblings: Item[]; tmdb: Record<string, unknown> | null; tmdbLang: string;
}) {
  const p = parseName(it.name, it.kind);
  const h = cat ? parseCategory(cat.name) : null;
  const qy: CatalogQuery = { kind: it.kind, q: "", cat: "", vis: "", tmdb: "", page: 1, view: "flat" };
  const kindLabel = it.kind === "vod" ? "Film" : it.kind === "series" ? "Série" : "Chaîne";
  const raw = it.raw;
  const d = tmdb as { title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; vote_average?: number; vote_count?: number; genres?: { name: string }[]; runtime?: number; poster_path?: string; overview?: string } | null;
  return (
    <>
      <div class="mb-4">
        <p class="text-secondary small mb-1"><a href={`/admin/catalog?kind=${it.kind}&view=flat&q=${encodeURIComponent(it.cleanTitle ?? it.name)}`}>← {kindLabel}s</a></p>
        <h1 class="h2 mb-1">{it.name}</h1>
        <p class="text-secondary mb-0">{kindLabel} · identifiant amont <code>{it.xtreamId}</code> · interne #{it.id}</p>
      </div>
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <Table title="Entrée fournisseur" rows={[
            ["Nom", it.name], ["Catégorie", cat ? `${cat.name}${cat.hiddenByRule || cat.hiddenManual ? " (masquée)" : ""}` : it.categoryXtreamId],
            ["Position", it.position], ["Conteneur", raw.container_extension], ["Ajouté", it.addedAt], ["Vu à l'import", it.seenAt],
            ["Masqué par une règle", it.hiddenByRule ? "oui" : "non"], ["Masqué à la main", it.hiddenManual ? "oui" : "non"],
            ["tmdb_id amont", raw.tmdb ?? raw.tmdb_id], ["Année amont", raw.year ?? raw.releaseDate ?? raw.release_date], ["Note amont", raw.rating],
          ]} extra={<VisibilityToggle scope="item" id={it.id} hiddenByRule={it.hiddenByRule} hiddenManual={it.hiddenManual} catHidden={Boolean(cat && (cat.hiddenByRule || cat.hiddenManual))} qy={qy} />} />
          <Table title="Lecture du nom" extra="ce que la grammaire en tire" rows={[
            ["Titre nettoyé", p.title], ["Année", p.year], ["Marché", p.market], ["Langue", p.language], ["Qualité", p.quality], ["Dynamique", p.dynamicRange], ["Tags", p.tags], ["Saison", p.seasonHint],
            ["Indices de la catégorie", h ? [h.market && `marché ${h.market}`, h.language && `langue ${h.language}`, h.quality && `qualité ${h.quality}`, h.dynamicRange, ...h.tags].filter(Boolean).join(", ") : null],
            ["Retenu en base", `${it.lang ?? "—"} · ${it.quality ?? "qualité inconnue"}${it.dynamicRange ? ` · ${it.dynamicRange}` : ""}${it.market ? ` · marché ${it.market}` : ""}`],
          ]} />
          {it.kind !== "live" && (
            <div class="card mb-3"><div class="card-header fw-semibold">Association TMDB <small class="text-secondary ms-2">{MATCH[it.matchStatus] ?? it.matchStatus}{it.matchScore != null ? ` · score ${Math.round(it.matchScore * 100)} %` : ""}{it.matchedAt ? ` · ${it.matchedAt.toLocaleString("fr-FR")}` : ""}</small></div>
              <div class="card-body">
                <TmdbCell it={it} />
                {d && <table class="table table-sm mt-3 mb-0"><tbody>
                  <Row k="Titre TMDB" v={`${d.title ?? d.name}${d.original_title && d.original_title !== d.title ? ` (${d.original_title})` : d.original_name && d.original_name !== d.name ? ` (${d.original_name})` : ""}`} />
                  <Row k="Sortie" v={d.release_date ?? d.first_air_date} /><Row k="Note" v={d.vote_average != null ? `${d.vote_average} (${fmt(d.vote_count ?? 0)} votes)` : null} />
                  <Row k="Genres" v={(d.genres ?? []).map((g) => g.name)} /><Row k="Durée" v={d.runtime ? `${d.runtime} min` : null} />
                  <Row k="Résumé" v={d.overview ? d.overview.slice(0, 300) + (d.overview.length > 300 ? "…" : "") : null} /><Row k="Langue du cache" v={tmdbLang} />
                </tbody></table>}
                <div class="mt-3" id="explain">
                  <button class="btn btn-sm btn-outline-secondary" hx-get={`/admin/item/${it.id}/explain`} hx-target="#explain" hx-swap="innerHTML" hx-indicator="this">Pourquoi ce résultat ? <span class="htmx-indicator spinner-border spinner-border-sm ms-1" role="status" aria-label="Analyse en cours"></span></button>
                  <span class="small text-secondary ms-2">rejoue le matching sans rien écrire</span>
                </div>
              </div></div>
          )}
        </div>
        <div class="col-12 col-lg-6">
          <Table title="Contenu" extra={content ? <a href={`/admin/catalog?kind=${it.kind}&view=groups&q=${encodeURIComponent(content.title)}`}>voir le groupe</a> : "aucun : relancer l'étape 4"} rows={content ? [
            ["Clé", content.key], ["Titre", content.title], ["Titre original", content.originalTitle], ["Année", content.year], ["Note", content.rating], ["Genres", content.genres],
            ["Variantes", content.variantCount], ["Langues", content.languages], ["Qualité max", ["—", "SD", "HD", "FHD", "4K"][content.maxQualityRank]], ["Dynamique", content.dynamicRange],
            ["Visible pour l'app", content.visible ? "oui" : "non"], ["Ajouté", content.addedAt], ["Override manuel", it.keyOverride],
          ] : [["Clé calculée", it.contentKey]]} />
          {siblings.length > 1 && (
            <div class="card mb-3"><div class="card-header fw-semibold">Variantes du même contenu <small class="text-secondary ms-2">{siblings.length}</small></div>
              <ul class="list-group list-group-flush">{siblings.map((s) => (
                <li class={`list-group-item small d-flex gap-2 ${s.id === it.id ? "fw-semibold" : ""}`}>
                  <a class="text-truncate" href={`/admin/item/${s.id}`}>{s.name}</a>
                  <span class="ms-auto text-nowrap text-secondary">{s.lang ?? "?"} · {s.quality ?? "?"}{s.dynamicRange ? ` · ${s.dynamicRange}` : ""}{s.hiddenByRule || s.hiddenManual ? " · masqué" : ""}</span>
                </li>))}</ul>
            </div>
          )}
          <div class="card mb-3"><div class="card-header fw-semibold">JSON amont brut</div>
            <pre class="card-body small mb-0" style="max-height: 28rem; overflow: auto">{JSON.stringify(raw, null, 1)}</pre></div>
        </div>
      </div>
    </>
  );
}

const pct = (n: number) => `${Math.round(n * 100)} %`;
export function ExplainView({ e, kind }: { e: MatchExplanation; kind: "vod" | "series" }) {
  const url = (id: number) => `https://www.themoviedb.org/${kind === "vod" ? "movie" : "tv"}/${id}`;
  return (
    <div class="small">
      <p class="mb-1">Titre cherché : <strong>{e.cleaned.title}</strong>{e.cleaned.year ? ` (${e.cleaned.year})` : " (sans année)"} · seuil {pct(e.threshold)}</p>
      {e.provided && (
        <p class="mb-1">Identifiant amont <a href={url(e.provided.id)} target="_blank" rel="noreferrer">#{e.provided.id}</a> : {e.provided.found
          ? <>« {e.provided.title} »{e.provided.year ? ` (${e.provided.year})` : ""}, similarité {pct(e.provided.similarity)} → <span class={e.provided.accepted ? "text-success" : "text-danger"}>{e.provided.accepted ? "accepté" : `rejeté (sous ${pct(e.idThreshold)}, ou année trop éloignée)`}</span></>
          : <span class="text-danger">inconnu de TMDB</span>}</p>
      )}
      {e.searches.map((s) => (
        <div class="mb-1">Recherche {s.withYear ? `avec l'année ${s.withYear}` : "sans année"} : {s.candidates.length ? "" : <span class="text-secondary">aucun résultat</span>}
          {s.candidates.length > 0 && <table class="table table-sm mb-1"><thead><tr><th>Résultat</th><th>Année</th><th>Similarité</th><th>Score</th></tr></thead><tbody>
            {s.candidates.map((c) => <tr class={c.score >= e.threshold ? "table-success" : ""}><td><a href={url(c.result.id)} target="_blank" rel="noreferrer">{c.result.title ?? c.result.name}</a>{(c.result.original_title ?? c.result.original_name) && (c.result.original_title ?? c.result.original_name) !== (c.result.title ?? c.result.name) ? <span class="text-secondary"> ({c.result.original_title ?? c.result.original_name})</span> : ""}</td><td>{c.year ?? "—"}</td><td>{pct(c.similarity)}</td><td>{pct(c.score)}</td></tr>)}
          </tbody></table>}
        </div>
      ))}
      {e.alternative && <p class="mb-1">Meilleur candidat <a href={url(e.alternative.id)} target="_blank" rel="noreferrer">#{e.alternative.id}</a> rejugé sur tous ses titres ({e.alternative.names.slice(0, 6).join(" · ")}{e.alternative.names.length > 6 ? " · …" : ""}) : similarité {pct(e.alternative.similarity)}</p>}
      <p class="mb-0">Verdict : <strong class={e.verdict.status === "matched" ? "text-success" : "text-danger"}>{e.verdict.status === "matched" ? `associé à #${e.verdict.tmdbId}` : "introuvable"}</strong>{e.verdict.via === "search" ? ` par recherche, score ${pct(e.verdict.score)}` : e.verdict.via === "alternative" ? ` par un titre alternatif, similarité ${pct(e.verdict.score)}` : e.verdict.via === "id" ? " par l'identifiant amont" : e.verdict.score ? ` (meilleur score ${pct(e.verdict.score)})` : ""}</p>
    </div>
  );
}
