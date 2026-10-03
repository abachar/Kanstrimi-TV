import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { addToWaitlist, listWaitlist, removeFromWaitlist, searchWaitlistCandidates, type WaitlistAddResult } from "@/catalog";
import { describeError } from "@/shared";
import { back, page, zerr, intParam } from "../http";
import { WaitlistView } from "./view";

/** `/admin/waitlist`: the movies awaited before the provider has them, added from a TMDB search. */
export const waitlistRoutes = new Hono();

const addSchema = z.object({ tmdb_id: z.coerce.number().int().positive(), q: z.string().default("") });

const ADDED: Record<WaitlistAddResult, { ok?: string; err?: string }> = {
  added: { ok: "Film ajouté à la liste d'attente" },
  already: { err: "Ce film est déjà dans la liste" },
  in_catalog: { err: "Ce film est déjà visible dans le catalogue" },
  no_tmdb: { err: "Clé API TMDB non configurée" },
  unknown: { err: "TMDB ne connaît pas ce film" },
};

const here = (q: string) => (q ? `/admin/waitlist?q=${encodeURIComponent(q)}` : "/admin/waitlist");

waitlistRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  let error: string | null = null;
  const [rows, candidates] = await Promise.all([
    listWaitlist(),
    q
      ? searchWaitlistCandidates(q).catch((e) => {
          error = describeError(e);
          return undefined;
        })
      : undefined,
  ]);
  return page(c, "Liste d'attente", <WaitlistView rows={rows} q={q} candidates={candidates} error={error} />);
});
waitlistRoutes.post(
  "/",
  zValidator("form", addSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/waitlist", { err: zerr(r.error) });
  }),
  async (c) => {
    const { tmdb_id, q } = c.req.valid("form");
    try {
      return back(c, here(q.trim()), ADDED[await addToWaitlist(tmdb_id)]);
    } catch (e) {
      return back(c, here(q.trim()), { err: `TMDB injoignable : ${describeError(e)}` });
    }
  },
);
waitlistRoutes.post("/:tmdbId{\\d+}/remove", async (c) => {
  await removeFromWaitlist(intParam(c, "tmdbId"));
  return back(c, "/admin/waitlist", { ok: "Film retiré de la liste" });
});
