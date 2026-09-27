import { Hono } from "hono";
import { db, schema, visibleItem } from "@/db";
import { and, eq } from "drizzle-orm";
import { getSettings, isUnlocked } from "@/config";
import { getDevice, isCode } from "@/devices";
import { upstreamStreamUrl } from "@/providers/xtream";
import type { Env } from "./context";
import { fail } from "./http";
import { parseSourceId, verifyStreamSignature } from "./stream-links";

/** `/stream/{source}`: a signed link (no token) answered by a 302 to the provider. The video never flows through here. */
export const streamRoutes = new Hono<Env>();

streamRoutes.get("/:source", async (c) => {
  const src = parseSourceId(c.req.param("source"));
  const code = (c.req.query("d") ?? "").toUpperCase(),
    exp = Number(c.req.query("e")),
    sig = c.req.query("s") ?? "";
  if (!src || !isCode(code) || !verifyStreamSignature(c.req.param("source"), code, exp, sig))
    return fail("unauthorized", "Lien de lecture invalide ou expiré");
  const device = await getDevice(code);
  if (!device || device.status !== "approved") return fail("unauthorized", "Appareil dissocié");
  if (!isUnlocked()) return fail("locked", "Serveur verrouillé : rouvrir l'application");
  const s = await getSettings();
  const target = await upstreamOf(src);
  if (target === null) return fail("not_found", "Source introuvable");
  const url = upstreamStreamUrl(s, target.kind, target.id, target.ext);
  if (!url) return fail("upstream", "Fournisseur non configuré");
  return c.redirect(url, 302);
});

/** The provider-side identity of a source, if it is still visible. */
async function upstreamOf(src: {
  kind: "item" | "episode";
  id: number;
}): Promise<{ kind: "live" | "movie" | "series"; id: string; ext: string } | null> {
  if (src.kind === "item") {
    const [it] = await db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.id, src.id), visibleItem));
    if (!it || it.kind === "series") return null;
    return {
      kind: it.kind === "live" ? "live" : "movie",
      id: it.xtreamId,
      ext: String(it.raw.container_extension ?? (it.kind === "live" ? "ts" : "mp4")),
    };
  }
  const [row] = await db
    .select({ s: schema.episodeSources })
    .from(schema.episodeSources)
    .innerJoin(schema.items, eq(schema.items.id, schema.episodeSources.itemId))
    .where(and(eq(schema.episodeSources.id, src.id), visibleItem));
  return row ? { kind: "series", id: row.s.xtreamId, ext: row.s.container ?? "mp4" } : null;
}
