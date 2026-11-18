/**
 * The switch of a variant on its content's page. Reads as "Visible", never as "Masqué": a switch
 * that is off must mean the thing is off. The stored column is `hidden`, so the UI value is
 * its opposite — the route inverts it back, then the page reloads: the content's own visibility and
 * aggregates follow. The filter of its kind or a category hidden outranks the switch, which says so
 * instead of showing a lie.
 * `short`: a one-word label, for a narrow column; the title still says why.
 */
export function VisibilityToggle({
  id,
  filtered = false,
  hidden,
  catHidden = false,
  short = false,
}: {
  id: number;
  /** The filter of its kind leaves it out (true), or has not judged it yet (null). */
  filtered?: boolean | null;
  hidden: boolean;
  catHidden?: boolean;
  short?: boolean;
}) {
  const domId = `vis-item-${id}`;
  const visible = !hidden;
  const forced =
    filtered !== false
      ? short
        ? "Filtre"
        : "Écartée par les filtres de tous les profils"
      : catHidden
        ? short
          ? "Catégorie"
          : "Masqué par la catégorie"
        : null;
  const label = forced ?? (visible ? "Visible" : "Masqué");
  const title =
    filtered === null
      ? "Pas encore jugée par les filtres : elle le sera au prochain passage de l'étape « Filtres »."
      : filtered
        ? "Le filtre de son type ne la garde pas : modifiez-le pour la réafficher."
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
