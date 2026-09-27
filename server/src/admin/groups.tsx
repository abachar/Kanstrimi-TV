import type { Content, Item, Category } from "@/db/schema";
import { fmt } from "./layout";

export type GroupsQuery = { kind: "live" | "vod" | "series"; q: string; only: "" | "multi" | "fallback" | "hidden" | "adult"; page: number };
const PAGE = 50;

export function groupsLink(qy: GroupsQuery, p: Partial<GroupsQuery> = {}) {
  const v = { ...qy, ...p };
  return "/admin/catalog?" + new URLSearchParams({ view: "groups", kind: v.kind, q: v.q, only: v.only, page: String(v.page) }).toString();
}

const keyKind = (key: string) => key.startsWith("tmdb:") ? "TMDB" : key.startsWith("fallback:") ? "repli" : key.startsWith("manual:") ? "séparé" : key.startsWith("live:") ? "direct" : "fusion";

/**
 * One content per row, its variants loaded on demand (HTMX) into the row itself. The
 * variant list is where the two manual actions live: split one variant out, or merge it
 * into another content by searching its title.
 */
export function GroupsView({ qy, rows, total }: { qy: GroupsQuery; rows: Content[]; total: number }) {
  const link = (p: Partial<GroupsQuery>) => groupsLink(qy, p);
  return (
    <>
      <form method="get" action="/admin/catalog" class="row g-2 mb-3" role="search">
        <input type="hidden" name="view" value="groups" /><input type="hidden" name="kind" value={qy.kind} />
        <div class="col-12 col-md-5"><input class="form-control" type="search" name="q" value={qy.q} placeholder="Rechercher un contenu…" aria-label="Rechercher un contenu" enterkeyhint="search" /></div>
        <div class="col-8 col-md-4"><select class="form-select" name="only" aria-label="Filtre">
          {[["", "Tous les contenus"], ["multi", "Plusieurs variantes"], ["fallback", "Sans TMDB (repli)"], ["hidden", "Invisibles"], ["adult", "Adultes"]].map(([v, l]) => <option value={v} selected={v === qy.only}>{l}</option>)}
        </select></div>
        <div class="col-4 col-md-3 d-grid"><button class="btn btn-secondary">Filtrer</button></div>
      </form>
      <p class="text-secondary small">{fmt(total)} contenu(s)</p>
      <div class="list-group mb-3">
        {rows.map((c) => <GroupRow c={c} />)}
        {rows.length === 0 && <div class="list-group-item small text-secondary">Aucun contenu — lancer l'étape 4.</div>}
      </div>
      <nav class="d-flex align-items-center gap-3" aria-label="Pagination">
        {qy.page > 1 && <a class="btn btn-outline-secondary btn-sm" href={link({ page: qy.page - 1 })} rel="prev">← Précédent</a>}
        <span class="text-secondary small">Page {qy.page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
        {qy.page * PAGE < total && <a class="btn btn-outline-secondary btn-sm ms-auto" href={link({ page: qy.page + 1 })} rel="next">Suivant →</a>}
      </nav>
    </>
  );
}
export const GROUPS_PAGE = PAGE;

export function GroupRow({ c }: { c: Content }) {
  const id = `group-${c.id}`;
  return (
    <div class="list-group-item group-root" id={id}>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <button class="btn btn-sm btn-outline-secondary" hx-get={`/admin/catalog/groups/${c.id}`} hx-target={`#${id}-variants`} hx-swap="innerHTML"
          aria-expanded="false" aria-controls={`${id}-variants`} title="Afficher les variantes">{fmt(c.variantCount)} variante{c.variantCount > 1 ? "s" : ""}</button>
        <span class={`fw-semibold${c.visible ? "" : " text-secondary text-decoration-line-through"}`}>{c.title}</span>
        {c.year && <span class="text-secondary small">{c.year}</span>}
        <span class="badge text-bg-secondary fw-normal">{keyKind(c.key)}</span>
        {c.languages.map((l) => <span class="badge text-bg-dark fw-normal">{l}</span>)}
        {c.dynamicRange && <span class="badge text-bg-dark fw-normal">{c.dynamicRange}</span>}
        {c.adult && <span class="badge text-bg-warning fw-normal">adulte</span>}
        <code class="small text-secondary ms-md-auto">{c.key}</code>
      </div>
      <div id={`${id}-variants`}></div>
    </div>
  );
}

/** The variants of one content, with the split / merge actions. */
export function GroupVariants({ c, items, cats }: { c: Content; items: Item[]; cats: Map<string, Category> }) {
  return (
    <div class="mt-2 small">
      {items.map((it) => {
        const cat = it.categoryXtreamId ? cats.get(`${it.kind}:${it.categoryXtreamId}`) : undefined;
        const hidden = it.hiddenByRule || it.hiddenManual || Boolean(cat && (cat.hiddenByRule || cat.hiddenManual));
        return (
          <div class="row g-2 align-items-center border-top py-1" id={`variant-${it.id}`}>
            <div class={`col-12 col-md-5${hidden ? " text-secondary text-decoration-line-through" : ""}`}><a class="link-body-emphasis text-decoration-none" href={`/admin/item/${it.id}`}>{it.name}</a></div>
            <div class="col-6 col-md-2"><span class="badge text-bg-dark fw-normal">{it.lang ?? "?"}</span> <span class="badge text-bg-dark fw-normal">{it.quality ?? "?"}</span> {it.dynamicRange && <span class="badge text-bg-dark fw-normal">{it.dynamicRange}</span>}</div>
            <div class="col-6 col-md-2 text-secondary text-truncate">{cat?.name ?? it.categoryXtreamId ?? ""}</div>
            <div class="col-12 col-md-3 d-flex gap-1 justify-content-md-end">
              {it.keyOverride
                ? <button class="btn btn-sm btn-outline-secondary" hx-post={`/admin/catalog/groups/reset/${it.id}`} hx-target={`#group-${c.id}`} hx-swap="outerHTML" title="Revenir au groupement automatique">Automatique</button>
                : <>
                  {items.length > 1 && <button class="btn btn-sm btn-outline-secondary" hx-post={`/admin/catalog/groups/split/${it.id}`} hx-target={`#group-${c.id}`} hx-swap="outerHTML" title="Faire de cette variante un contenu à part">Séparer</button>}
                  <button class="btn btn-sm btn-outline-secondary" hx-get={`/admin/catalog/groups/merge-form/${it.id}`} hx-target={`#variant-${it.id}`} hx-swap="beforeend" title="Rattacher cette variante à un autre contenu">Fusionner dans…</button>
                </>}
            </div>
          </div>
        );
      })}
      {c.key.startsWith("fallback:") && <div class="text-secondary mt-1">Sans association TMDB : corriger le matching dans la vue « Liste » règle le groupement dans la plupart des cas.</div>}
    </div>
  );
}

export function MergeForm({ itemId, results }: { itemId: number; results?: { id: number; key: string; title: string; year: number | null; variantCount: number }[] }) {
  return (
    <div class="col-12" id={`merge-${itemId}`}>
      <form class="d-flex gap-2" hx-post="/admin/catalog/groups/merge-search" hx-target={`#merge-${itemId}`} hx-swap="outerHTML">
        <input type="hidden" name="id" value={String(itemId)} />
        <input class="form-control form-control-sm" name="q" placeholder="Titre du contenu cible…" aria-label="Titre du contenu cible" autofocus />
        <button class="btn btn-sm btn-secondary">Chercher</button>
      </form>
      {results && (
        <div class="list-group mt-1">
          {results.map((r) => (
            <button class="list-group-item list-group-item-action py-1" hx-post="/admin/catalog/groups/merge" hx-vals={JSON.stringify({ id: itemId, key: r.key })} hx-target="closest .list-group-item.group-root" hx-swap="outerHTML">
              {r.title}{r.year ? ` (${r.year})` : ""} <span class="text-secondary">· {r.variantCount} variante(s) · <code>{r.key}</code></span>
            </button>
          ))}
          {results.length === 0 && <div class="list-group-item py-1 text-secondary">Aucun contenu.</div>}
        </div>
      )}
    </div>
  );
}
