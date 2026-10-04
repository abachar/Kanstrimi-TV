import type { Content } from "@/db";
import type { MergeCandidate } from "@/catalog";
import { isCategoryHidden, isItemHidden } from "@/db";
import { isFallbackKey, keyKind, qualityOfRank } from "@/catalog";
import { runtimeText } from "@/player";
import { signedImagePath } from "@/shared";
import type { ContentDetail, GuideLine, VariantDetail } from "./data";
import { fmt, hhmm } from "../format";
import { KEY_KIND_LABELS, KIND_TITLES, MATCH_LABELS, MATCH_TONES } from "../labels";
import { TmdbCell } from "../catalog/tmdb-cell";
import { VisibilityToggle } from "../catalog/visibility";
import type { CatalogQuery } from "../catalog/query";
import { Badge, BUSY } from "../ui";
import { Icon } from "../icons";

const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
const shown = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v instanceof Date ? v.toLocaleString("fr-FR") : v));
type Fact = [k: string, v: unknown];

/** Label and value side by side, one line each between separators, the empty ones left out. */
const Facts = ({ facts }: { facts: Fact[] }) => (
  <table class="table table-fixed">
    <tbody>
      {facts
        .filter(([, v]) => !empty(v))
        .map(([k, v]) => (
          <tr>
            <th class="w-1/3 py-2 pe-3 text-start align-top font-normal whitespace-normal text-muted-foreground">{k}</th>
            <td class="py-2 break-words whitespace-normal">{shown(v)}</td>
          </tr>
        ))}
    </tbody>
  </table>
);

/** A column of an unfolded variant: a title, where the data comes from, then its facts. */
const Panel = ({ title, hint, extra, children }: { title: string; hint: string; extra?: unknown; children?: unknown }) => (
  <section class="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4">
    <header class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold">{title}</h3>
        <p class="text-xs text-muted-foreground">{hint}</p>
      </div>
      {extra}
    </header>
    {children}
  </section>
);

const IPTV_MATCH: Record<string, string> = {
  epg: "par l'identifiant EPG du fournisseur",
  name: "par le nom, dans le pays",
  "name-global": "par le nom, unique au monde",
  manual: "à la main",
};

/** Live: the iptv-org channel of the variant, and a way to pin another one, none, or go back to automatic. */
function IptvPanel({ v }: { v: VariantDetail }) {
  const { item: it, iptv: ch } = v;
  return (
    <Panel
      title="Chaîne iptv-org"
      hint={`Étape channels · ${it.iptvMatch ? `rattachée ${IPTV_MATCH[it.iptvMatch] ?? it.iptvMatch}` : "non rattachée"}`}
    >
      {ch && (
        <div class="flex items-start gap-3">
          {ch.logoPath && (
            <img src={ch.logoPath} alt="" width="40" height="40" class="size-10 rounded bg-muted object-contain p-1" loading="lazy" />
          )}
          <Facts
            facts={[
              ["Identifiant", ch.id],
              ["Nom", [ch.name, ...ch.altNames].join(" · ")],
              ["Pays", ch.country],
              ["Catégories", ch.categories],
              ["Groupe", [ch.network, ...ch.owners].filter(Boolean).join(" · ")],
              ["Site", ch.website],
              ["Fermée", ch.closed ? `${ch.closed}${ch.replacedBy ? ` → ${ch.replacedBy}` : ""}` : null],
              ["Adulte", ch.isNsfw ? "oui" : null],
            ]}
          />
        </div>
      )}
      {!ch && it.iptvId && <p class="text-sm text-amber-400">« {it.iptvId} » n'existe plus dans iptv-org.</p>}
      <form method="post" action={`/admin/item/${it.id}/iptv`} class="flex flex-wrap items-center gap-2">
        <input
          class="input h-8 w-40 font-mono"
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
    </Panel>
  );
}

type TmdbSheet = {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
};

/** Films and series: the TMDB match of the variant and the replay of the matching. */
function TmdbPanel({ v, tmdbLang }: { v: VariantDetail; tmdbLang: string }) {
  const it = v.item;
  const d = v.tmdb as TmdbSheet | null;
  const explain = `explain-${it.id}`;
  return (
    <Panel
      title="TMDB"
      hint={`Étape enrich · ${MATCH_LABELS[it.matchStatus] ?? it.matchStatus}${it.matchScore != null ? ` · score ${Math.round(it.matchScore * 100)} %` : ""}${it.matchedAt ? ` · ${it.matchedAt.toLocaleDateString("fr-FR")}` : ""}`}
    >
      <TmdbCell it={it} />
      {d && (
        <Facts
          facts={[
            ["Titre", d.title ?? d.name],
            ["Sortie", d.release_date ?? d.first_air_date],
            ["Note", d.vote_average != null ? `${d.vote_average} (${fmt(d.vote_count ?? 0)} votes)` : null],
            ["Cache", tmdbLang],
          ]}
        />
      )}
      <div id={explain}>
        <button
          class="btn"
          data-variant="outline"
          data-size="sm"
          hx-get={`/admin/item/${it.id}/explain`}
          hx-target={`#${explain}`}
          hx-swap="innerHTML"
          hx-indicator="this"
          title="Rejoue le matching sans rien écrire"
        >
          Pourquoi ce résultat ?
          <span class={BUSY} role="status" aria-label="Analyse en cours">
            <Icon name="loader" cls="size-4 animate-spin" />
          </span>
        </button>
      </div>
    </Panel>
  );
}

/** « ⋯ »: split out, merge into another content, or back to the automatic grouping. A native popover: no script. */
function GroupMenu({ v, alone }: { v: VariantDetail; alone: boolean }) {
  const it = v.item;
  const ITEM = "w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted";
  return (
    <details class="relative">
      <summary class="btn list-none" data-variant="ghost" data-size="icon-sm" aria-label="Actions sur la variante" title="Actions">
        <Icon name="more" cls="size-4" />
      </summary>
      <div class="absolute end-0 top-full z-20 mt-1 flex w-60 flex-col rounded-lg border bg-background p-1 shadow-lg">
        {it.keyOverride ? (
          <button class={ITEM} hx-post={`/admin/item/${it.id}/reset`}>
            Revenir au groupement automatique
          </button>
        ) : (
          <>
            {!alone && (
              <button class={ITEM} hx-post={`/admin/item/${it.id}/split`}>
                Séparer en un contenu à part
              </button>
            )}
            <button class={ITEM} hx-get={`/admin/item/${it.id}/merge-form`} hx-target={`#merge-slot-${it.id}`} hx-swap="innerHTML">
              Fusionner dans un autre contenu…
            </button>
          </>
        )}
      </div>
    </details>
  );
}

/** The search for the content to merge a variant into; a hit merges it. */
export function MergeForm({ itemId, results }: { itemId: number; results?: MergeCandidate[] }) {
  return (
    <div class="flex flex-col gap-2 border-t bg-muted/20 px-4 py-3" id={`merge-${itemId}`}>
      <form class="flex gap-2" hx-post="/admin/item/merge-search" hx-target={`#merge-${itemId}`} hx-swap="outerHTML">
        <input type="hidden" name="id" value={String(itemId)} />
        <input class="input h-8" type="text" name="q" placeholder="Titre du contenu cible…" aria-label="Titre du contenu cible" autofocus />
        <button class="btn" data-variant="secondary" data-size="sm">
          Chercher
        </button>
      </form>
      {results && (
        <div class="flex flex-col divide-y overflow-hidden rounded-lg border">
          {results.map((r) => (
            <button
              class="px-3 py-1.5 text-start hover:bg-muted"
              hx-post="/admin/item/merge"
              hx-vals={JSON.stringify({ id: itemId, key: r.key })}
            >
              {r.title}
              {r.year ? ` (${r.year})` : ""}{" "}
              <span class="text-muted-foreground">
                · {r.variantCount} variante(s) · <code class="font-mono text-xs">{r.key}</code>
              </span>
            </button>
          ))}
          {results.length === 0 && <div class="px-3 py-1.5 text-muted-foreground">Aucun contenu.</div>}
        </div>
      )}
    </div>
  );
}

/** The columns of a variant's row, md+ (the summary and the header share them); the switch and the menu sit over its end. */
const VROW =
  "grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[1rem_minmax(0,5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)_minmax(0,2fr)_9.5rem]";
const VCELL = "max-md:col-start-2";

const VariantHeader = ({ live }: { live: boolean }) => (
  <div class={`${VROW} bg-muted/30 text-xs font-medium text-muted-foreground max-md:hidden`}>
    <span />
    <span>Nom chez le fournisseur</span>
    <span>Qualité</span>
    <span>Langue</span>
    <span>Catégorie</span>
    <span>{live ? "iptv-org" : "TMDB"}</span>
    <span>Visibilité</span>
  </div>
);

/**
 * One provider entry, a row of the table; unfolded, what the naming read in it on a grey line, then
 * what the provider sends and its match side by side.
 */
function VariantRow({ v, open, alone, tmdbLang }: { v: VariantDetail; open: boolean; alone: boolean; tmdbLang: string }) {
  const { item: it, category: cat } = v;
  const qy: CatalogQuery = { kind: it.kind, q: "", cat: "", page: 1, view: "xtream" };
  const hidden = isItemHidden(it, cat ?? undefined);
  const live = it.kind === "live";
  const raw = it.raw;
  const quality = [it.quality, it.dynamicRange].filter(Boolean).join(" · ");
  // What the naming read in the name and the category, and nowhere else on the row.
  const read = [
    it.cleanTitle && it.cleanTitle !== it.name ? `« ${it.cleanTitle} »` : null,
    it.year,
    it.seasonHint != null ? `saison ${it.seasonHint}` : null,
    it.tags.length ? it.tags.join(", ") : null,
    it.market ? `marché ${it.market}` : null,
    it.section,
    it.theme,
    it.country ? `pays ${it.country}` : null,
    it.adult ? "adulte" : null,
    `clé ${it.keyOverride ?? it.contentKey}${it.keyOverride ? " (imposée)" : ""}`,
    `amont ${it.xtreamId} · interne #${it.id}`,
  ].filter((x) => x !== null && x !== "");
  return (
    <div class="relative" id={`variant-${it.id}`}>
      <details class="group/v" open={open}>
        <summary class={`${VROW} cursor-pointer list-none pe-40 hover:bg-muted/40 md:pe-4`}>
          <Icon name="chevron-right" cls="size-4 text-muted-foreground transition-transform group-open/v:rotate-90" />
          <span class={`min-w-0 break-words ${hidden ? "text-muted-foreground line-through" : "font-medium"}`}>
            {it.name}
            {it.edition && (
              <span class="ms-2 align-middle">
                <Badge tone="muted">{it.edition}</Badge>
              </span>
            )}
          </span>
          <span class={VCELL}>{quality && <Badge tone="muted">{quality}</Badge>}</span>
          <span class={VCELL}>{it.lang && <Badge tone="muted">{it.lang}</Badge>}</span>
          <span class={`${VCELL} truncate text-muted-foreground`} title={cat?.name ?? ""}>
            {cat?.name ?? it.categoryXtreamId ?? "Sans catégorie"}
          </span>
          <span class={VCELL}>
            {live ? (
              <Badge tone={it.iptvId ? "ok" : "muted"}>{it.iptvId ?? "aucune"}</Badge>
            ) : (
              <Badge tone={MATCH_TONES[it.matchStatus] ?? "muted"}>
                {MATCH_LABELS[it.matchStatus] ?? it.matchStatus}
                {it.matchScore != null ? ` ${Math.round(it.matchScore * 100)} %` : ""}
              </Badge>
            )}
          </span>
          <span class="max-md:hidden" />
        </summary>
        <div class="border-t bg-muted/20 p-4">
          <p class="mb-3 text-xs text-muted-foreground">{read.join(" · ")}</p>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Fournisseur" hint="Étape source : ce qu'envoie le serveur Xtream">
              <Facts
                facts={[
                  ["Catégorie", cat ? `${cat.name}${isCategoryHidden(cat) ? " (masquée)" : ""}` : it.categoryXtreamId],
                  ["Position", it.position],
                  ["Conteneur", raw.container_extension],
                  ["Ajouté", it.addedAt],
                  ["Changé", it.changedAt],
                  ["tmdb_id", raw.tmdb ?? raw.tmdb_id],
                  ["Année", raw.year ?? raw.releaseDate ?? raw.release_date],
                  ["Note", raw.rating],
                  ["Masquée", it.hiddenByRule ? "par une règle" : it.hiddenManual ? "à la main" : null],
                ]}
              />
              <details class="group">
                <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  <span class="group-open:hidden">Afficher le JSON brut</span>
                  <span class="hidden group-open:inline">Masquer le JSON brut</span>
                </summary>
                <pre class="mt-2 max-h-[24rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{JSON.stringify(raw, null, 1)}</pre>
              </details>
            </Panel>
            {live ? <IptvPanel v={v} /> : <TmdbPanel v={v} tmdbLang={tmdbLang} />}
          </div>
        </div>
      </details>
      {/* Beside the summary, never inside: a click on the switch or the menu must not fold the row. */}
      <div class="absolute end-3 top-1 flex h-9 items-center gap-1">
        <VisibilityToggle
          scope="item"
          id={it.id}
          hiddenByRule={it.hiddenByRule}
          hiddenManual={it.hiddenManual}
          catHidden={isCategoryHidden(cat)}
          qy={qy}
          reload
          short
        />
        <GroupMenu v={v} alone={alone} />
      </div>
      <div id={`merge-slot-${it.id}`}></div>
    </div>
  );
}

/** The sheet as the app receives it: picture, titles, what it plays in, its story; the bookkeeping on a grey line. */
function Hero({ c, guide, total }: { c: Content; guide: GuideLine[]; total: number }) {
  const live = c.kind === "live";
  const quality = [qualityOfRank(c.maxQualityRank), c.dynamicRange].filter(Boolean);
  const originals = [c.originalTitle, c.titleEn].filter((t) => t && t !== c.title);
  const meta = live
    ? [c.channelNumber != null ? `n° ${c.channelNumber}` : null, c.market?.toUpperCase(), c.country, c.themes.join(", ")]
    : [c.genres.join(", "), c.runtime ? runtimeText(c.runtime) : null, c.rating ? `★ ${c.rating.toFixed(1)}` : null, c.certification];
  return (
    <section class="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:flex-row">
      {live
        ? c.logoUrl && (
            <img src={c.logoUrl} alt="" width="128" height="128" class="size-32 shrink-0 rounded-lg bg-muted object-contain p-3" />
          )
        : c.posterPath && (
            <img
              src={signedImagePath("w342", c.posterPath)}
              alt=""
              width="160"
              class="w-40 shrink-0 self-start rounded-lg"
              loading="lazy"
            />
          )}
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-semibold tracking-tight break-words">
              {c.title}
              {c.year ? <span class="font-normal text-muted-foreground"> ({c.endYear ? `${c.year}–${c.endYear}` : c.year})</span> : ""}
            </h1>
            {originals.length > 0 && <p class="text-sm text-muted-foreground">{originals.join(" · ")}</p>}
          </div>
          <span
            class={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${c.visible ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/20 text-destructive"}`}
          >
            <span class={`size-2 rounded-full ${c.visible ? "bg-emerald-400" : "bg-destructive"}`} />
            {c.visible ? "Visible dans l'app" : "Masqué dans l'app"}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge tone={isFallbackKey(c.key) ? "warn" : "plain"}>{KEY_KIND_LABELS[keyKind(c.key)]}</Badge>
          {quality.map((q) => (
            <Badge tone="plain">{q}</Badge>
          ))}
          {c.languages.map((l) => (
            <Badge tone="muted">{l}</Badge>
          ))}
          {c.adult && <Badge tone="warn">adulte</Badge>}
          <span class="text-sm text-muted-foreground">{meta.filter(Boolean).join(" · ")}</span>
        </div>
        {live && guide.length > 0 && (
          <div class="flex flex-col gap-1 text-sm">
            {guide.map((p, i) => (
              <p>
                <span class="text-muted-foreground tabular-nums">
                  {hhmm(p.startAt)}–{hhmm(p.endAt)}
                </span>{" "}
                {i === 0 && p.startAt <= new Date() ? <Badge tone="bad">en ce moment</Badge> : <Badge tone="muted">ensuite</Badge>}{" "}
                {p.title}
              </p>
            ))}
          </div>
        )}
        {c.overview && <p class="text-sm leading-relaxed">{c.overview}</p>}
        <p class="mt-auto text-xs text-muted-foreground">
          <code class="font-mono">{c.key}</code> · ajouté le {c.addedAt.toLocaleDateString("fr-FR")} · {fmt(c.variantCount)} variante
          {c.variantCount > 1 ? "s" : ""} visible{c.variantCount > 1 ? "s" : ""} sur {fmt(total)}
          {live && c.epgChannelId ? ` · guide ${c.epgChannelId}` : ""}
          {c.adult && c.visible ? " · servi seulement si les contenus adultes sont activés" : ""}
        </p>
      </div>
    </section>
  );
}

/**
 * One page per content: the sheet the app receives, then each provider entry grouped under it as a
 * row, the one asked for (`open`) unfolded. An entry not grouped yet is shown alone.
 */
export function ContentView({ content, variants, tmdbLang, guide, open }: ContentDetail & { open: number | null }) {
  const kind = content?.kind ?? variants[0].item.kind;
  const alone = variants.length < 2;
  return (
    <>
      <a
        class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        href={`/admin/catalog?kind=${kind}`}
      >
        <Icon name="chevron-left" cls="size-4" />
        {KIND_TITLES[kind]}
      </a>
      {content ? (
        <Hero c={content} guide={guide} total={variants.length} />
      ) : (
        <div>
          <h1 class="text-2xl font-semibold tracking-tight break-words">{variants[0].item.name}</h1>
          <p class="text-sm text-muted-foreground">Pas encore regroupée : relancer l'étape group.</p>
        </div>
      )}
      {content && isFallbackKey(content.key) && (
        <p class="text-sm text-amber-400">
          Sans association TMDB : corriger le matching d'une variante règle le groupement dans la plupart des cas.
        </p>
      )}
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">
          Variantes du fournisseur <span class="font-normal text-muted-foreground">{fmt(variants.length)}</span>
        </h2>
        <div class="flex flex-col divide-y rounded-xl border">
          <VariantHeader live={kind === "live"} />
          {variants.map((v) => (
            <VariantRow v={v} open={v.item.id === open} alone={alone} tmdbLang={tmdbLang} />
          ))}
        </div>
      </section>
    </>
  );
}
