import type { Category } from "@/db";
import { isCategoryHidden } from "@/db";
import { fmt } from "../layout";
import { CatalogHeader } from "./row";
import { VisibilityToggle } from "./visibility";
import { categoryItemsLink, type CatalogQuery } from "./query";

/**
 * Grouped view: one Bootstrap accordion item per category. The switch sits *beside* the
 * accordion button, never inside it: a checkbox nested in a button is neither valid nor
 * clickable. The button is `overflow-hidden` so a long category name truncates instead of
 * shoving the switch past the right edge of a phone.
 */
export function CategoryRow({ c, qy, count }: { c: Category; qy: CatalogQuery; count?: number }) {
  const hidden = isCategoryHidden(c);
  return (
    <div class="accordion-item">
      {/* The strip is painted by the header, not the button (`bg-transparent shadow-none`):
          an opened button paints its own background and would split the row in two. */}
      <div class="accordion-header d-flex align-items-center bg-body-tertiary">
        <button type="button" class="accordion-button collapsed bg-transparent shadow-none overflow-hidden" data-bs-toggle="collapse" data-bs-target={`#cat-${c.id}`} aria-expanded="false"
          hx-get={categoryItemsLink(qy, c.xtreamId, 1)} hx-target={`#rows-${c.id}`} hx-swap="beforeend" hx-trigger="click once">
          <span class={`fw-semibold text-truncate ${hidden ? "text-secondary text-decoration-line-through" : ""}`}>{c.name}</span>
          {count != null && <span class="badge text-bg-secondary ms-2 flex-shrink-0">{fmt(count)}</span>}
        </button>
        <div class="pe-3 flex-shrink-0 text-nowrap">
          <VisibilityToggle scope="category" id={c.id} hiddenByRule={c.hiddenByRule} hiddenManual={c.hiddenManual} qy={qy} />
        </div>
      </div>
      <div id={`cat-${c.id}`} class="accordion-collapse collapse">
        <div class="accordion-body p-0">
          {/* The rows container *is* the flush list, so appended items stay direct children and keep the flush borders. */}
          <div id={`rows-${c.id}`} class="list-group list-group-flush"><CatalogHeader qy={qy} /></div>
        </div>
      </div>
    </div>
  );
}
