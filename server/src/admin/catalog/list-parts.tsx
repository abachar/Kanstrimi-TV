import { Busy } from "../ui";
import { Icon } from "../icons";

/** The summary of a foldable list (shelf, channel group): one row high, the whole width. */
export const SUMMARY = "flex h-12 w-full min-w-0 items-center gap-2 bg-muted/30 px-4 text-sm hover:bg-muted/50";

/** Continues a list when it scrolls into view or on click: the next page replaces this, where it stands. */
export const More = ({ link }: { link: string }) => (
  <div
    class="flex items-center justify-center gap-2 py-2"
    hx-get={link}
    hx-trigger="intersect once, click"
    hx-target="this"
    hx-swap="outerHTML"
    hx-indicator="this"
  >
    {/* The button is only an affordance: the click bubbles up to the row, which owns the request. */}
    <button type="button" class="btn" data-variant="link" data-size="sm">
      <Icon name="chevron-down" />
      Charger la suite
    </button>
    <Busy label="Chargement" />
  </div>
);
