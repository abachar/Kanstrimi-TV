import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** The admin's visibility switches. The switch reads "Visible"; the column stores the opposite. */
export async function setItemHiddenManual(id: number, hiddenManual: boolean) {
  await db.update(schema.catalogVariants).set({ hiddenManual }).where(eq(schema.catalogVariants.id, id));
}
export async function setCategoryHiddenManual(id: number, hiddenManual: boolean) {
  await db.update(schema.catalogCategories).set({ hiddenManual }).where(eq(schema.catalogCategories.id, id));
}
