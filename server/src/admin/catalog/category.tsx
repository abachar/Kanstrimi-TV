import type { Category } from "@/db";
import { isCategoryHidden } from "@/db";
import { fmt } from "../format";
import { NO_CATEGORY } from "./data";
import { Badge } from "../ui";
import { CatalogHeader, SUMMARY } from "./row";
import { VisibilityToggle } from "./visibility";
import { categoryItemsLink, type CatalogQuery } from "./query";

/**
 * Grouped view: one `<details>` per category, its rows loaded by htmx the first time it opens
 * (`toggle once` on the details itself: a click on the switch never fires it). The switch sits
 * *beside* the summary, never inside it: a checkbox nested in a summary would toggle the
 * category open. It is laid over the summary's right end, which keeps room for it (`pe-*`),
 * so a long category name truncates instead of shoving the switch past the edge of a phone.
 */

/**
 * The entries the provider sends without a category. No switch: there is no category to hide,
 * each entry is hidden by hand or by a rule on its name. Listed first so they are never overlooked:
 * the app receives them, and no category rule ever reaches them.
 */
export function NoCategoryRow({ qy, count }: { qy: CatalogQuery; count: number }) {
  return (
    <details
      id="cat-none"
      hx-get={categoryItemsLink(qy, NO_CATEGORY, 1)}
      hx-target="#rows-none"
      hx-swap="beforeend"
      hx-trigger="toggle once"
    >
      <summary class={SUMMARY}>
        <span class="truncate font-medium italic">Sans catégorie</span>
        <Badge tone="warn">{fmt(count)}</Badge>
        <span class="ms-auto truncate text-xs text-muted-foreground max-md:hidden">envoyées sans catégorie par le fournisseur</span>
      </summary>
      <div id="rows-none" class="flex flex-col divide-y border-t">
        <CatalogHeader qy={qy} />
      </div>
    </details>
  );
}

export function CategoryRow({ c, qy, count }: { c: Category; qy: CatalogQuery; count?: number }) {
  const hidden = isCategoryHidden(c);
  return (
    <div class="relative">
      <details
        id={`cat-${c.id}`}
        hx-get={categoryItemsLink(qy, c.xtreamId, 1)}
        hx-target={`#rows-${c.id}`}
        hx-swap="beforeend"
        hx-trigger="toggle once"
      >
        <summary class={`${SUMMARY} pe-48`}>
          <span class={`truncate font-medium ${hidden ? "text-muted-foreground line-through" : ""}`}>{c.name}</span>
          {count != null && <Badge tone={hidden ? "muted" : "plain"}>{fmt(count)}</Badge>}
        </summary>
        {/* Appended rows stay direct children of the rows container, so `divide-y` draws every border. */}
        <div id={`rows-${c.id}`} class="flex flex-col divide-y border-t">
          <CatalogHeader qy={qy} />
        </div>
      </details>
      <div class="absolute end-4 top-0 flex h-12 items-center">
        <VisibilityToggle scope="category" id={c.id} hiddenByRule={c.hiddenByRule} hiddenManual={c.hiddenManual} qy={qy} />
      </div>
    </div>
  );
}
