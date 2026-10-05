/**
 * The switch of a variant on its content's page. Reads as "Visible", never as "Masqué": a switch
 * that is off must mean the thing is off. The stored column is `hidden_manual`, so the UI value is
 * its opposite — the route inverts it back, then the page reloads: the content's own visibility and
 * aggregates follow. A language not served or a category hidden outranks the switch, which says so
 * instead of showing a lie; the rules judge the content, their verdict shows in its header.
 * `short`: a one-word label, for a narrow column; the title still says why.
 */
export function VisibilityToggle({
  id,
  hiddenByLanguage = false,
  hiddenManual,
  catHidden = false,
  short = false,
}: {
  id: number;
  hiddenByLanguage?: boolean;
  hiddenManual: boolean;
  catHidden?: boolean;
  short?: boolean;
}) {
  const domId = `vis-item-${id}`;
  const visible = !hiddenManual;
  const forced = hiddenByLanguage
    ? short
      ? "Langue"
      : "Langue non servie"
    : catHidden
      ? short
        ? "Catégorie"
        : "Masqué par la catégorie"
      : null;
  const label = forced ?? (visible ? "Visible" : "Masqué");
  const title = hiddenByLanguage
    ? "Sa langue n'est pas servie : cochez-la dans Paramètres pour le réafficher."
    : catHidden
      ? "Sa catégorie est masquée à la main."
      : "Afficher ou masquer cette variante pour l'app";
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
        hx-post={`/admin/catalog/item/${id}/visible`}
        hx-trigger="change"
        hx-swap="none"
      />
      <label class={`text-sm ${forced || !visible ? "text-muted-foreground" : ""}`} for={`${domId}-input`}>
        {label}
      </label>
    </div>
  );
}
