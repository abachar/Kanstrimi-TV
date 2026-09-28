import type { Content, Item, Category } from "@/db";
import { GROUPS_PAGE } from "./data";
import type { MergeCandidate } from "@/catalog";
import { isItemHidden } from "@/db";
import { fmt } from "../format";
import { Badge, Options, Pagination } from "../ui";
import { groupsLink, type GroupsQuery } from "./query";
import { keyKind, isFallbackKey } from "@/catalog";
import { KEY_KIND_LABELS } from "../labels";

/**
 * One content per row, its variants loaded on demand (HTMX) into the row itself. The
 * variant list is where the two manual actions live: split one variant out, or merge it
 * into another content by searching its title.
 */
export function GroupsView({ qy, rows, total }: { qy: GroupsQuery; rows: Content[]; total: number }) {
  return (
    <>
      <form method="get" action="/admin/catalog" class="grid grid-cols-3 gap-2 md:grid-cols-12" role="search">
        <input type="hidden" name="view" value="groups" />
        <input type="hidden" name="kind" value={qy.kind} />
        <div class="col-span-3 md:col-span-5">
          <input
            class="input"
            type="search"
            name="q"
            value={qy.q}
            placeholder="Rechercher un contenu…"
            aria-label="Rechercher un contenu"
            enterkeyhint="search"
          />
        </div>
        <div class="col-span-2 md:col-span-4">
          <select class="select w-full" name="only" aria-label="Filtre">
            <Options
              opts={[
                ["", "Tous les contenus"],
                ["multi", "Plusieurs variantes"],
                ["fallback", "Sans TMDB (repli)"],
                ["hidden", "Invisibles"],
                ["adult", "Adultes"],
              ]}
              cur={qy.only}
            />
          </select>
        </div>
        <div class="grid md:col-span-3">
          <button class="btn" data-variant="secondary">
            Filtrer
          </button>
        </div>
      </form>
      <p class="text-sm text-muted-foreground">{fmt(total)} contenu(s)</p>
      <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
        {rows.map((c) => (
          <GroupRow c={c} />
        ))}
        {rows.length === 0 && <div class="px-4 py-3 text-sm text-muted-foreground">Aucun contenu — lancer l'étape 4.</div>}
      </div>
      <Pagination page={qy.page} total={total} size={GROUPS_PAGE} link={(page) => groupsLink(qy, { page })} />
    </>
  );
}

export function GroupRow({ c }: { c: Content }) {
  const id = `group-${c.id}`;
  return (
    <div class="flex flex-col px-4 py-3" id={id} data-group-root>
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="btn"
          data-variant="outline"
          data-size="xs"
          hx-get={`/admin/catalog/groups/${c.id}`}
          hx-target={`#${id}-variants`}
          hx-swap="innerHTML"
          aria-expanded="false"
          aria-controls={`${id}-variants`}
          title="Afficher les variantes"
        >
          {fmt(c.variantCount)} variante{c.variantCount > 1 ? "s" : ""}
        </button>
        <span class={`text-sm font-medium ${c.visible ? "" : "text-muted-foreground line-through"}`}>{c.title}</span>
        {c.year && <span class="text-xs text-muted-foreground tabular-nums">{c.year}</span>}
        <Badge tone={isFallbackKey(c.key) ? "warn" : "plain"}>{KEY_KIND_LABELS[keyKind(c.key)]}</Badge>
        {c.languages.map((l) => (
          <Badge tone="muted">{l}</Badge>
        ))}
        {c.dynamicRange && <Badge tone="muted">{c.dynamicRange}</Badge>}
        {c.adult && <Badge tone="warn">adulte</Badge>}
        <code class="truncate font-mono text-xs text-muted-foreground max-md:basis-full md:ms-auto">{c.key}</code>
      </div>
      <div id={`${id}-variants`}></div>
    </div>
  );
}

/** The variants of one content, with the split / merge actions. */
export function GroupVariants({ c, items, cats }: { c: Content; items: Item[]; cats: Map<string, Category> }) {
  return (
    <div class="mt-2 flex flex-col text-sm">
      {items.map((it) => {
        const cat = it.categoryXtreamId ? cats.get(`${it.kind}:${it.categoryXtreamId}`) : undefined;
        const hidden = isItemHidden(it, cat);
        return (
          <div class="grid grid-cols-2 items-center gap-2 border-t py-2 md:grid-cols-12" id={`variant-${it.id}`}>
            <div class={`col-span-2 min-w-0 md:col-span-5 ${hidden ? "text-muted-foreground line-through" : ""}`}>
              <a class="break-words hover:underline" href={`/admin/item/${it.id}`}>
                {it.name}
              </a>
            </div>
            <div class="flex flex-wrap gap-1 md:col-span-2">
              <Badge tone="muted">{it.lang ?? "?"}</Badge>
              <Badge tone="muted">{it.quality ?? "?"}</Badge>
              {it.dynamicRange && <Badge tone="muted">{it.dynamicRange}</Badge>}
            </div>
            <div class="truncate text-muted-foreground md:col-span-2">{cat?.name ?? it.categoryXtreamId ?? ""}</div>
            <div class="col-span-2 flex flex-wrap gap-1 md:col-span-3 md:justify-end">
              {it.keyOverride ? (
                <button
                  class="btn"
                  data-variant="outline"
                  data-size="xs"
                  hx-post={`/admin/catalog/groups/reset/${it.id}`}
                  hx-target={`#group-${c.id}`}
                  hx-swap="outerHTML"
                  title="Revenir au groupement automatique"
                >
                  Automatique
                </button>
              ) : (
                <>
                  {items.length > 1 && (
                    <button
                      class="btn"
                      data-variant="outline"
                      data-size="xs"
                      hx-post={`/admin/catalog/groups/split/${it.id}`}
                      hx-target={`#group-${c.id}`}
                      hx-swap="outerHTML"
                      title="Faire de cette variante un contenu à part"
                    >
                      Séparer
                    </button>
                  )}
                  <button
                    class="btn"
                    data-variant="outline"
                    data-size="xs"
                    hx-get={`/admin/catalog/groups/merge-form/${it.id}`}
                    hx-target={`#variant-${it.id}`}
                    hx-swap="beforeend"
                    title="Rattacher cette variante à un autre contenu"
                  >
                    Fusionner dans…
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {isFallbackKey(c.key) && (
        <div class="border-t pt-2 text-muted-foreground">
          Sans association TMDB : corriger le matching dans « Par catégorie » (ou via la recherche) règle le groupement dans la plupart des
          cas.
        </div>
      )}
    </div>
  );
}

/** Appended into the variant's grid row: it spans the whole row. */
export function MergeForm({ itemId, results }: { itemId: number; results?: MergeCandidate[] }) {
  return (
    <div class="col-span-2 flex flex-col gap-2 md:col-span-12" id={`merge-${itemId}`}>
      <form class="flex gap-2" hx-post="/admin/catalog/groups/merge-search" hx-target={`#merge-${itemId}`} hx-swap="outerHTML">
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
              hx-post="/admin/catalog/groups/merge"
              hx-vals={JSON.stringify({ id: itemId, key: r.key })}
              hx-target="closest [data-group-root]"
              hx-swap="outerHTML"
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
