import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError } from "@/shared";
import { refreshVisibility } from "./grouping/group";
import { withCatalogLock } from "./lock";

/**
 * The admin's visibility switches. The switch reads "Visible"; the column stores the opposite. The contents it
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
export async function setCategoryHiddenManual(id: number, hiddenManual: boolean) {
  const [cat] = await db
    .update(schema.catalogCategories)
    .set({ hiddenManual })
    .where(eq(schema.catalogCategories.id, id))
    .returning({ kind: schema.catalogCategories.kind, xtreamId: schema.catalogCategories.xtreamId });
  if (!cat) return;
  const rows = await db
    .selectDistinct({ contentId: sql<number>`${schema.catalogVariants.contentId}` })
    .from(schema.catalogVariants)
    .where(
      and(
        eq(schema.catalogVariants.kind, cat.kind),
        eq(schema.catalogVariants.categoryXtreamId, cat.xtreamId),
        isNotNull(schema.catalogVariants.contentId),
      ),
    );
  if (rows.length) refreshInBackground(rows.map((r) => r.contentId));
}

function refreshInBackground(contentIds: number[]) {
  void withCatalogLock(() => refreshVisibility(contentIds)).catch((e) =>
    console.error(`[visibilité] recalcul des contenus échoué : ${describeError(e)}`),
  );
}
