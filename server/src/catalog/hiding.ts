import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError } from "@/shared";
import { refreshVisibility } from "./grouping/group";
import { withCatalogLock } from "./lock";

/**
 * The admin's visibility switch of a variant. The switch reads "Visible"; the column stores the opposite. The contents it
 * touches follow at once, in the background under the catalogue lock: the switch never waits behind a pipeline run,
 * and the app sees the change without waiting for the next `group`.
 */
export async function setItemHiddenManual(id: number, hiddenManual: boolean) {
  const [row] = await db
    .update(schema.catalogVariants)
    .set({ hiddenManual })
    .where(eq(schema.catalogVariants.id, id))
    .returning({ contentId: schema.catalogVariants.contentId });
  if (row?.contentId != null) refreshInBackground([row.contentId]);
}
function refreshInBackground(contentIds: number[]) {
  void withCatalogLock(() => refreshVisibility(contentIds)).catch((e) =>
    console.error(`[visibilité] recalcul des contenus échoué : ${describeError(e)}`),
  );
}
