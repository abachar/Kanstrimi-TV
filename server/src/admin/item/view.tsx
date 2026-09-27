import type { ItemDetail } from "./data";
import { isCategoryHidden, isItemHidden } from "@/db";
import { parseName, parseCategory, qualityOfRank } from "@/catalog";
import { fmt } from "../format";
import { KIND_NAMES, MATCH_LABELS } from "../labels";
import { TmdbCell } from "../catalog/tmdb-cell";
import { VisibilityToggle } from "../catalog/visibility";
import type { CatalogQuery } from "../catalog/query";

const Row = ({ k, v }: { k: string; v: unknown }) => (
  <tr>
    <th class="text-secondary fw-normal text-nowrap pe-3 w-25">{k}</th>
    <td class="text-break">
      {v === null || v === undefined || v === "" ? (
        <span class="text-secondary">—</span>
      ) : Array.isArray(v) ? (
        v.join(", ")
      ) : (
        String(v instanceof Date ? v.toLocaleString("fr-FR") : v)
      )}
    </td>
  </tr>
);
const Table = ({ title, rows, extra }: { title: string; rows: [string, unknown][]; extra?: unknown }) => (
  <div class="card mb-3">
    <div class="card-header fw-semibold">
      {title}
      {extra && <small class="text-secondary ms-2">{extra}</small>}
    </div>
    <table class="table table-sm mb-0">
      <tbody>
        {rows.map(([k, v]) => (
          <Row k={k} v={v} />
        ))}
      </tbody>
    </table>
  </div>
);

/** Everything the server knows about one entry: the row, what the parser makes of it, its category, its content, its TMDB sheet. */
export function ItemView({ item: it, category: cat, content, siblings, tmdb, tmdbLang }: ItemDetail) {
  const p = parseName(it.name, it.kind);
  const h = cat ? parseCategory(cat.name) : null;
  const qy: CatalogQuery = { kind: it.kind, q: "", cat: "", vis: "", tmdb: "", page: 1, view: "flat" };
  const kindLabel = KIND_NAMES[it.kind];
  const raw = it.raw;
  const d = tmdb as {
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    genres?: { name: string }[];
    runtime?: number;
    poster_path?: string;
    overview?: string;
  } | null;
  return (
    <>
      <div class="mb-4">
        <p class="text-secondary small mb-1">
          <a href={`/admin/catalog?kind=${it.kind}&view=flat&q=${encodeURIComponent(it.cleanTitle ?? it.name)}`}>← {kindLabel}s</a>
        </p>
        <h1 class="h2 mb-1">{it.name}</h1>
        <p class="text-secondary mb-0">
          {kindLabel} · identifiant amont <code>{it.xtreamId}</code> · interne #{it.id}
        </p>
      </div>
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <Table
            title="Entrée fournisseur"
            rows={[
              ["Nom", it.name],
              ["Catégorie", cat ? `${cat.name}${isCategoryHidden(cat) ? " (masquée)" : ""}` : it.categoryXtreamId],
              ["Position", it.position],
              ["Conteneur", raw.container_extension],
              ["Ajouté", it.addedAt],
              ["Vu à l'import", it.seenAt],
              ["Masqué par une règle", it.hiddenByRule ? "oui" : "non"],
              ["Masqué à la main", it.hiddenManual ? "oui" : "non"],
              ["tmdb_id amont", raw.tmdb ?? raw.tmdb_id],
              ["Année amont", raw.year ?? raw.releaseDate ?? raw.release_date],
              ["Note amont", raw.rating],
            ]}
            extra={
              <VisibilityToggle
                scope="item"
                id={it.id}
                hiddenByRule={it.hiddenByRule}
                hiddenManual={it.hiddenManual}
                catHidden={isCategoryHidden(cat)}
                qy={qy}
              />
            }
          />
          <Table
            title="Lecture du nom"
            extra="ce que la grammaire en tire"
            rows={[
              ["Titre nettoyé", p.title],
              ["Année", p.year],
              ["Marché", p.market],
              ["Langue", p.language],
              ["Qualité", p.quality],
              ["Dynamique", p.dynamicRange],
              ["Tags", p.tags],
              ["Saison", p.seasonHint],
              [
                "Indices de la catégorie",
                h
                  ? [
                      h.market && `marché ${h.market}`,
                      h.language && `langue ${h.language}`,
                      h.quality && `qualité ${h.quality}`,
                      h.dynamicRange,
                      ...h.tags,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : null,
              ],
              [
                "Retenu en base",
                `${it.lang ?? "—"} · ${it.quality ?? "qualité inconnue"}${it.dynamicRange ? ` · ${it.dynamicRange}` : ""}${it.market ? ` · marché ${it.market}` : ""}${it.adult ? " · adulte (fournisseur)" : ""}`,
              ],
            ]}
          />
          {it.kind !== "live" && (
            <div class="card mb-3">
              <div class="card-header fw-semibold">
                Association TMDB{" "}
                <small class="text-secondary ms-2">
                  {MATCH_LABELS[it.matchStatus] ?? it.matchStatus}
                  {it.matchScore != null ? ` · score ${Math.round(it.matchScore * 100)} %` : ""}
                  {it.matchedAt ? ` · ${it.matchedAt.toLocaleString("fr-FR")}` : ""}
                </small>
              </div>
              <div class="card-body">
                <TmdbCell it={it} />
                {d && (
                  <table class="table table-sm mt-3 mb-0">
                    <tbody>
                      <Row
                        k="Titre TMDB"
                        v={`${d.title ?? d.name}${d.original_title && d.original_title !== d.title ? ` (${d.original_title})` : d.original_name && d.original_name !== d.name ? ` (${d.original_name})` : ""}`}
                      />
                      <Row k="Sortie" v={d.release_date ?? d.first_air_date} />
                      <Row k="Note" v={d.vote_average != null ? `${d.vote_average} (${fmt(d.vote_count ?? 0)} votes)` : null} />
                      <Row k="Genres" v={(d.genres ?? []).map((g) => g.name)} />
                      <Row k="Durée" v={d.runtime ? `${d.runtime} min` : null} />
                      <Row k="Résumé" v={d.overview ? d.overview.slice(0, 300) + (d.overview.length > 300 ? "…" : "") : null} />
                      <Row k="Langue du cache" v={tmdbLang} />
                    </tbody>
                  </table>
                )}
                <div class="mt-3" id="explain">
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    hx-get={`/admin/item/${it.id}/explain`}
                    hx-target="#explain"
                    hx-swap="innerHTML"
                    hx-indicator="this"
                  >
                    Pourquoi ce résultat ?{" "}
                    <span class="htmx-indicator spinner-border spinner-border-sm ms-1" role="status" aria-label="Analyse en cours"></span>
                  </button>
                  <span class="small text-secondary ms-2">rejoue le matching sans rien écrire</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div class="col-12 col-lg-6">
          <Table
            title="Contenu"
            extra={
              content ? (
                <a href={`/admin/catalog?kind=${it.kind}&view=groups&q=${encodeURIComponent(content.title)}`}>voir le groupe</a>
              ) : (
                "aucun : relancer l'étape 4"
              )
            }
            rows={
              content
                ? [
                    ["Clé", content.key],
                    ["Titre", content.title],
                    ["Titre original", content.originalTitle],
                    ["Titre anglais", content.titleEn],
                    ["Année", content.year],
                    ["Note", content.rating],
                    ["Genres", content.genres],
                    ["Variantes", content.variantCount],
                    ["Langues", content.languages],
                    ["Qualité max", qualityOfRank(content.maxQualityRank)],
                    ["Dynamique", content.dynamicRange],
                    [
                      "Visible pour l'app",
                      content.visible ? (content.adult ? "oui, sauf si les contenus adultes sont désactivés (Paramètres)" : "oui") : "non",
                    ],
                    ["Adulte", content.adult ? "oui" : "non"],
                    ["Ajouté", content.addedAt],
                    ["Override manuel", it.keyOverride],
                  ]
                : [["Clé calculée", it.contentKey]]
            }
          />
          {siblings.length > 1 && (
            <div class="card mb-3">
              <div class="card-header fw-semibold">
                Variantes du même contenu <small class="text-secondary ms-2">{siblings.length}</small>
              </div>
              <ul class="list-group list-group-flush">
                {siblings.map((s) => (
                  <li class={`list-group-item small d-flex gap-2 ${s.id === it.id ? "fw-semibold" : ""}`}>
                    <a class="text-truncate" href={`/admin/item/${s.id}`}>
                      {s.name}
                    </a>
                    <span class="ms-auto text-nowrap text-secondary">
                      {s.lang ?? "?"} · {s.quality ?? "?"}
                      {s.dynamicRange ? ` · ${s.dynamicRange}` : ""}
                      {isItemHidden(s) ? " · masqué" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Folded by default: the raw document can run to hundreds of lines. */}
          <div class="card mb-3">
            <div class="card-header d-flex align-items-center">
              <span class="fw-semibold">JSON amont brut</span>
              <button
                type="button"
                class="btn btn-link btn-sm ms-auto py-0"
                data-bs-toggle="collapse"
                data-bs-target="#raw-json"
                aria-expanded="false"
                aria-controls="raw-json"
              >
                Afficher
              </button>
            </div>
            <div class="collapse" id="raw-json">
              <pre class="card-body small mb-0 overflow-auto">{JSON.stringify(raw, null, 1)}</pre>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
