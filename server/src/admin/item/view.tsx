import type { ItemDetail } from "./data";
import { isCategoryHidden, isItemHidden } from "@/db";
import { parseName, parseCategory, qualityOfRank } from "@/catalog";
import { fmt } from "../format";
import { KIND_NAMES, MATCH_LABELS } from "../labels";
import { TmdbCell } from "../catalog/tmdb-cell";
import { VisibilityToggle } from "../catalog/visibility";
import type { CatalogQuery } from "../catalog/query";
import { Card } from "../ui";
import { Icon } from "../icons";

const Row = ({ k, v }: { k: string; v: unknown }) => (
  <tr>
    <th class="w-1/3 py-2 pe-3 text-start align-top font-normal whitespace-normal text-muted-foreground">{k}</th>
    <td class="py-2 break-words whitespace-normal">
      {v === null || v === undefined || v === "" ? (
        <span class="text-muted-foreground">—</span>
      ) : Array.isArray(v) ? (
        v.join(", ")
      ) : (
        String(v instanceof Date ? v.toLocaleString("fr-FR") : v)
      )}
    </td>
  </tr>
);
const Rows = ({ rows }: { rows: [string, unknown][] }) => (
  <table class="table table-fixed">
    <tbody>
      {rows.map(([k, v]) => (
        <Row k={k} v={v} />
      ))}
    </tbody>
  </table>
);
const InfoCard = ({ title, rows, extra }: { title: string; rows: [string, unknown][]; extra?: unknown }) => (
  <Card title={title} extra={extra}>
    <Rows rows={rows} />
  </Card>
);

/** Everything the server knows about one entry: the row, what the parser makes of it, its category, its content, its TMDB sheet. */
const IPTV_MATCH: Record<string, string> = {
  epg: "par l'identifiant EPG du fournisseur",
  name: "par le nom, dans le pays",
  "name-global": "par le nom, unique au monde",
  manual: "à la main",
};

/** Live: the iptv-org channel of the variant, and a way to pin another one, none, or go back to automatic. */
function IptvCard({ it, ch }: { it: ItemDetail["item"]; ch: ItemDetail["iptv"] }) {
  return (
    <Card title="Chaîne iptv-org" hint={it.iptvMatch ? `Rattachée ${IPTV_MATCH[it.iptvMatch] ?? it.iptvMatch}` : "Non rattachée"}>
      <div class="flex flex-col gap-4">
        {ch && (
          <div class="flex items-start gap-3">
            {ch.logoPath && (
              <img src={ch.logoPath} alt="" width="48" height="48" class="size-12 rounded bg-muted object-contain p-1" loading="lazy" />
            )}
            <table class="table table-fixed">
              <tbody>
                <Row k="Identifiant" v={ch.id} />
                <Row k="Nom" v={[ch.name, ...ch.altNames].join(" · ")} />
                <Row k="Pays" v={ch.country} />
                <Row k="Catégories" v={ch.categories} />
                <Row k="Groupe" v={[ch.network, ...ch.owners].filter(Boolean).join(" · ") || null} />
                <Row k="Site" v={ch.website} />
                <Row k="Lancée" v={ch.launched} />
                <Row k="Fermée" v={ch.closed ? `${ch.closed}${ch.replacedBy ? ` → ${ch.replacedBy}` : ""}` : null} />
                <Row k="Adulte" v={ch.isNsfw ? "oui" : null} />
              </tbody>
            </table>
          </div>
        )}
        {!ch && it.iptvId && <p class="text-sm text-amber-400">« {it.iptvId} » n'existe plus dans iptv-org.</p>}
        <form method="post" action={`/admin/item/${it.id}/iptv`} class="flex flex-wrap items-center gap-2">
          <input
            class="input w-48 font-mono"
            name="iptv_id"
            placeholder="TF1.fr"
            value={it.iptvId ?? ""}
            aria-label="Identifiant iptv-org"
          />
          <button class="btn" data-variant="outline" data-size="sm" name="action" value="pin">
            Rattacher
          </button>
          <button class="btn" data-variant="ghost" data-size="sm" name="action" value="none">
            Aucune
          </button>
          {it.iptvMatch === "manual" && (
            <button class="btn" data-variant="ghost" data-size="sm" name="action" value="auto">
              Automatique
            </button>
          )}
        </form>
      </div>
    </Card>
  );
}

export function ItemView({ item: it, category: cat, content, siblings, tmdb, tmdbLang, iptv }: ItemDetail) {
  const p = parseName(it.name, it.kind);
  const h = cat ? parseCategory(cat.name) : null;
  const qy: CatalogQuery = { kind: it.kind, q: "", cat: "", vis: "all", tmdb: "", page: 1, view: "grouped" };
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
      <div class="flex flex-col gap-1">
        <a
          class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          href={`/admin/catalog?kind=${it.kind}&vis=all&q=${encodeURIComponent(it.cleanTitle ?? it.name)}`}
        >
          <Icon name="chevron-left" cls="size-4" />
          {kindLabel}s
        </a>
        <h1 class="text-2xl font-semibold tracking-tight break-words">{it.name}</h1>
        <p class="text-sm text-muted-foreground">
          {kindLabel} · identifiant amont <code class="font-mono">{it.xtreamId}</code> · interne #{it.id}
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-4">
          <InfoCard
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
          <InfoCard
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
              ["Section (direct)", it.section],
              ["Thème (direct)", it.theme],
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
          {it.kind === "live" && <IptvCard it={it} ch={iptv} />}
          {it.kind !== "live" && (
            <Card
              title="Association TMDB"
              hint={`${MATCH_LABELS[it.matchStatus] ?? it.matchStatus}${it.matchScore != null ? ` · score ${Math.round(it.matchScore * 100)} %` : ""}${it.matchedAt ? ` · ${it.matchedAt.toLocaleString("fr-FR")}` : ""}`}
            >
              <div class="flex flex-col gap-4">
                <TmdbCell it={it} />
                {d && (
                  <table class="table table-fixed">
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
                <div class="flex flex-wrap items-center gap-2" id="explain">
                  <button
                    class="btn"
                    data-variant="outline"
                    data-size="sm"
                    hx-get={`/admin/item/${it.id}/explain`}
                    hx-target="#explain"
                    hx-swap="innerHTML"
                    hx-indicator="this"
                  >
                    Pourquoi ce résultat ?
                    <span class="htmx-indicator inline-flex" role="status" aria-label="Analyse en cours">
                      <Icon name="loader" cls="size-4 animate-spin" />
                    </span>
                  </button>
                  <span class="text-sm text-muted-foreground">rejoue le matching sans rien écrire</span>
                </div>
              </div>
            </Card>
          )}
        </div>
        <div class="flex min-w-0 flex-col gap-4">
          <InfoCard
            title="Contenu"
            extra={
              content ? (
                <a class="hover:text-foreground" href={`/admin/catalog?kind=${it.kind}&view=groups&q=${encodeURIComponent(content.title)}`}>
                  voir le groupe
                </a>
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
            <Card title="Variantes du même contenu" extra={siblings.length}>
              <ul class="flex flex-col divide-y text-sm">
                {siblings.map((s) => (
                  <li class={`flex gap-2 py-2 first:pt-0 last:pb-0 ${s.id === it.id ? "font-semibold" : ""}`}>
                    <a class="min-w-0 truncate hover:underline" href={`/admin/item/${s.id}`}>
                      {s.name}
                    </a>
                    <span class="ms-auto whitespace-nowrap text-muted-foreground">
                      {s.lang ?? "?"} · {s.quality ?? "?"}
                      {s.dynamicRange ? ` · ${s.dynamicRange}` : ""}
                      {isItemHidden(s) ? " · masqué" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {/* Folded by default: the raw document can run to hundreds of lines. */}
          <section class="card">
            <details class="group">
              <summary class="flex cursor-pointer items-center justify-between gap-2 px-6 font-medium">
                JSON amont brut
                <span class="text-sm font-normal text-muted-foreground group-open:hidden">Afficher</span>
              </summary>
              <pre id="raw-json" class="mx-6 mt-4 max-h-[32rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(raw, null, 1)}
              </pre>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
