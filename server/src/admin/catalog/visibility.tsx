import { catalogQs, type CatalogQuery } from "./query";

/**
 * Reads as "Visible", never as "Masqué": a switch that is off must mean the thing is off.
 * The stored column is `hidden_manual`, so the UI value is its opposite — the route
 * inverts it back. A rule-based hiding is shown as a badge because the switch cannot
 * undo it (visible = neither hidden_by_rule nor hidden_manual).
 *
 * An item swaps its whole row, not just the switch: the name is struck through and greyed
 * out on the row and its cells, which would otherwise keep the stale style. A category
 * lives in an accordion header with no row around it and answers `HX-Refresh` instead —
 * targeting `closest .list-group-item` there resolves to nothing and htmx drops the request silently.
 * The current filters ride along in the query string so the route can rebuild the row.
 */
export function VisibilityToggle({
  scope,
  id,
  hiddenByRule,
  hiddenManual,
  catHidden = false,
  qy,
}: {
  scope: "item" | "category";
  id: number;
  hiddenByRule: boolean;
  hiddenManual: boolean;
  catHidden?: boolean;
  qy: CatalogQuery;
}) {
  const domId = `vis-${scope}-${id}`;
  const visible = !hiddenManual;
  // A rule or a hidden category outranks the switch: say which, instead of showing a lie.
  const forced = hiddenByRule ? "Masqué par une règle" : catHidden ? "Masqué par la catégorie" : null;
  const label = forced ?? (visible ? "Visible" : "Masqué");
  const title = hiddenByRule
    ? "Une règle de filtrage masque cet élément : modifiez la règle pour le réafficher."
    : catHidden
      ? "Sa catégorie est masquée : réaffichez la catégorie pour le rendre visible."
      : "Afficher ou masquer cet élément pour les applications IPTV";
  return (
    <div id={domId} class="d-flex align-items-center gap-2">
      <div class="form-check form-switch m-0">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          name="visible"
          id={`${domId}-input`}
          checked={visible && !forced}
          title={title}
          hx-post={`/admin/catalog/${scope}/${id}/visible?${catalogQs(qy)}`}
          hx-trigger="change"
          {...(scope === "item" ? { "hx-target": "closest .list-group-item", "hx-swap": "outerHTML" } : { "hx-swap": "none" })}
        />
        <label class={`form-check-label small ${forced || !visible ? "text-secondary" : ""}`} for={`${domId}-input`}>
          {label}
        </label>
      </div>
    </div>
  );
}
