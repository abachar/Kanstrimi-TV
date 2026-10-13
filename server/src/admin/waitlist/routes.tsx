import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  addToWaitlist,
  defaultProfile,
  listProfiles,
  listWaitlist,
  profileById,
  removeFromWaitlist,
  searchWaitlistCandidates,
  type WaitlistAddResult,
} from "@/catalog";
import { describeError } from "@/shared";
import { back, page, zerr, intParam } from "../http";
import { WaitlistView } from "./view";

/** `/admin/waitlist`: the movies awaited before the provider has them, added from a TMDB search. */
export const waitlistRoutes = new Hono();

const addSchema = z.object({
  tmdb_id: z.coerce.number().int().positive(),
  q: z.string().default(""),
  profile: z.coerce.number().int().positive(),
});

const ADDED: Record<WaitlistAddResult, { ok?: string; err?: string }> = {
  added: { ok: "Film ajouté à la liste d'attente" },
  already: { err: "Ce film est déjà dans la liste" },
  in_catalog: { err: "Ce film est déjà visible dans le catalogue" },
  no_tmdb: { err: "Clé API TMDB non configurée" },
  unknown: { err: "TMDB ne connaît pas ce film" },
};

const here = (q: string, profile: number) => {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  u.set("profile", String(profile));
  return `/admin/waitlist?${u}`;
};

/** The profile the page adds for: `?profile=`, else the default one. */
async function chosenProfile(c: Parameters<typeof page>[0]) {
  const id = Number(c.req.query("profile"));
  return (id ? await profileById(id) : null) ?? (await defaultProfile());
}

waitlistRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const profile = await chosenProfile(c);
  let error: string | null = null;
  const [rows, profiles, candidates] = await Promise.all([
    listWaitlist(),
    listProfiles(),
    q
      ? searchWaitlistCandidates(profile.id, q).catch((e) => {
          error = describeError(e);
          return undefined;
        })
      : undefined,
  ]);
  return page(
    c,
    "Liste d'attente",
    <WaitlistView rows={rows} q={q} candidates={candidates} error={error} profiles={profiles} profile={profile} />,
  );
});
waitlistRoutes.post(
  "/",
  zValidator("form", addSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/waitlist", { err: zerr(r.error) });
  }),
  async (c) => {
    const { tmdb_id, q, profile } = c.req.valid("form");
    if (!(await profileById(profile))) return back(c, "/admin/waitlist", { err: "Profil inconnu" });
    try {
      return back(c, here(q.trim(), profile), ADDED[await addToWaitlist(profile, tmdb_id)]);
    } catch (e) {
      return back(c, here(q.trim(), profile), { err: `TMDB injoignable : ${describeError(e)}` });
    }
  },
);
waitlistRoutes.post("/:profile{\\d+}/:tmdbId{\\d+}/remove", async (c) => {
  await removeFromWaitlist(intParam(c, "profile"), intParam(c, "tmdbId"));
  return back(c, "/admin/waitlist", { ok: "Film retiré de la liste" });
});
