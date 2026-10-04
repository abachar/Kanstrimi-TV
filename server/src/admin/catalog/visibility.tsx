import { catalogQs, type CatalogQuery } from "./query";

/**
 * Reads as "Visible", never as "Masqué": a switch that is off must mean the thing is off.
 * The stored column is `hidden_manual`, so the UI value is its opposite — the route
 * inverts it back. A rule-based hiding is shown as a badge because the switch cannot
 * undo it (visible = neither hidden_by_rule nor hidden_manual).
 *
 * An item swaps its whole row, not just the switch: the name is struck through and greyed
 * out on the row and its cells, which would otherwise keep the stale style. A category
 * lives in a category header with no row around it and answers `HX-Refresh` instead —
 * targeting `closest [data-item-row]` there resolves to nothing and htmx drops the request silently.
 * The current filters ride along in the query string so the route can rebuild the row.
 * `reload`: no row around it (the content page): the route answers `HX-Refresh` as for a category.
 * `short`: a one-word label, for a narrow column; the title still says why.
 */
export function VisibilityToggle({
  scope,
  id,
  hiddenByRule,
  hiddenManual,
  catHidden = false,
  qy,
  reload = false,
  short = false,
}: {
  scope: "item" | "category";
  id: number;
  hiddenByRule: boolean;
  hiddenManual: boolean;
  catHidden?: boolean;
  qy: CatalogQuery;
  reload?: boolean;
  short?: boolean;
}) {
  const domId = `vis-${scope}-${id}`;
  const visible = !hiddenManual;
  // A rule or a hidden category outranks the switch: say which, instead of showing a lie.
  const forced = hiddenByRule
    ? short
      ? "Règle"
      : "Masqué par une règle"
    : catHidden
      ? short
        ? "Catégorie"
        : "Masqué par la catégorie"
      : null;
  const label = forced ?? (visible ? "Visible" : "Masqué");
  const title = hiddenByRule
    ? "Une règle de filtrage masque cet élément : modifiez la règle pour le réafficher."
    : catHidden
      ? "Sa catégorie est masquée : réaffichez la catégorie pour le rendre visible."
      : "Afficher ou masquer cet élément pour l'app";
  return (
    <div id={domId} class="flex items-center gap-2">
      <input
        class="input"
        type="checkbox"
        role="switch"
        name="visible"
        id={`${domId}-input`}
        checked={visible && !forced}
        title={title}
        hx-post={`/admin/catalog/${scope}/${id}/visible?${catalogQs(qy)}${reload ? "&reload=1" : ""}`}
        hx-trigger="change"
        {...(scope === "item" && !reload ? { "hx-target": "closest [data-item-row]", "hx-swap": "outerHTML" } : { "hx-swap": "none" })}
      />
      <label class={`text-sm ${forced || !visible ? "text-muted-foreground" : ""}`} for={`${domId}-input`}>
        {label}
      </label>
    </div>
  );
}
