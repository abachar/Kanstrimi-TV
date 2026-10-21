import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  applyFilters,
  createProfile,
  deleteProfile,
  filtersPending,
  isTaskRunning,
  listFilters,
  listProfiles,
  previewFilter,
  profileById,
  ProfileError,
  saveFilter,
  PROFILE_QUALITIES,
  setDefaultProfile,
  updateProfile,
  updateProfileSettings,
} from "@/catalog";
import { KINDS, type Kind, type Profile } from "@/db";
import { encodeAvatar } from "@/player";
import { describeError } from "@/shared";
import { page, back, zerr, intParam, form, checked } from "../http";
import { AVATAR_ASSETS, FilterPreview, ProfilesView, ProfileView, type Draft, type ProfileLine } from "./view";

/**
 * `/admin/profiles`: the household. A profile's page holds its identity and its filters, one per kind;
 * saving a filter only marks the profile behind, « Appliquer maintenant » judges it alone, a pass of the
 * pipeline judges everyone.
 */
export const profilesRoutes = new Hono();

const filterSchema = z.object({ kind: z.enum(KINDS as unknown as [Kind, ...Kind[]]), query: z.string().default("") });

/** `data:image/…;base64,…` from the crop (`assets/avatar.js`) → a square WebP; null when the field is empty. */
async function avatarOf(fields: Record<string, string>): Promise<Buffer | null> {
  const data = fields.avatar ?? "";
  if (!data) return null;
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) throw new ProfileError("Photo illisible");
  try {
    return await encodeAvatar(Buffer.from(m[1], "base64"));
  } catch (e) {
    throw new ProfileError(`Photo illisible : ${describeError(e)}`);
  }
}

/** Profiles being judged from « Appliquer maintenant »: their button waits. */
const judging = new Set<number>();
function judgeInBackground(profileId: number) {
  if (judging.has(profileId)) return;
  judging.add(profileId);
  void applyFilters({ profileId })
    .catch((e) => console.error(`[profils] jugement du profil ${profileId} échoué : ${describeError(e)}`))
    .finally(() => judging.delete(profileId));
}

async function lines(): Promise<ProfileLine[]> {
  return Promise.all(
    (await listProfiles()).map(async (profile) => ({
      profile,
      filters: await listFilters(profile.id),
      pending: await filtersPending(profile.id),
      judged: profile.judgedAt !== null,
    })),
  );
}

const listPage = async (c: Parameters<typeof page>[0], error?: string) =>
  page(c, "Profils", <ProfilesView rows={await lines()} error={error} />, { assets: AVATAR_ASSETS });

const profilePage = async (c: Parameters<typeof page>[0], p: Profile, opts: { draft?: Draft; error?: string } = {}) =>
  page(
    c,
    p.name,
    <ProfileView
      p={p}
      filters={await listFilters(p.id)}
      pending={await filtersPending(p.id)}
      judged={p.judgedAt !== null}
      busy={judging.has(p.id) || isTaskRunning("pipeline")}
      draft={opts.draft}
      error={opts.error}
    />,
    { under: "/admin/profiles", assets: AVATAR_ASSETS },
  );

profilesRoutes.get("/", async (c) => listPage(c));

profilesRoutes.post("/", async (c) => {
  const f = await form(c);
  try {
    const avatar = await avatarOf(f);
    if (!avatar) throw new ProfileError("La photo est obligatoire");
    const p = await createProfile({ name: f.name ?? "", avatar });
    judgeInBackground(p.id);
    return back(c, `/admin/profiles/${p.id}`, { ok: "Profil créé — l'étape « Filtres » le juge maintenant" });
  } catch (e) {
    if (e instanceof ProfileError) return listPage(c, e.message);
    throw e;
  }
});

profilesRoutes.post("/preview", zValidator("form", filterSchema), async (c) => {
  const { kind, query } = c.req.valid("form");
  return c.html(<FilterPreview preview={await previewFilter(kind, query)} />);
});

profilesRoutes.get("/:id", async (c) => {
  const p = await profileById(intParam(c, "id"));
  return p ? profilePage(c, p) : c.notFound();
});

profilesRoutes.post("/:id", async (c) => {
  const p = await profileById(intParam(c, "id"));
  if (!p) return c.notFound();
  const f = await form(c);
  try {
    const avatar = await avatarOf(f);
    await updateProfile(p.id, { name: f.name, ...(avatar ? { avatar } : {}) });
    return back(c, `/admin/profiles/${p.id}`, { ok: "Profil enregistré" });
  } catch (e) {
    if (e instanceof ProfileError) return profilePage(c, p, { error: e.message });
    throw e;
  }
});

profilesRoutes.post(
  "/:id/filters",
  zValidator("form", filterSchema, (r, c) => {
    if (!r.success) return back(c, `/admin/profiles/${c.req.param("id")}`, { err: zerr(r.error) });
  }),
  async (c) => {
    const p = await profileById(intParam(c, "id"));
    if (!p) return c.notFound();
    const { kind, query } = c.req.valid("form");
    const error = await saveFilter(p.id, kind, query);
    // Refused: the page again, the query as typed, the mistake under it.
    if (error) return profilePage(c, p, { draft: { kind, query, error: `Requête invalide : ${error}` } });
    return back(c, `/admin/profiles/${p.id}`, { ok: "Filtre enregistré — à appliquer maintenant ou par un passage du traitement" });
  },
);

const settingsSchema = z.object({ max_quality: z.enum(PROFILE_QUALITIES) });
/** The playback settings; a switch left off is simply absent from the form. */
profilesRoutes.post(
  "/:id/settings",
  zValidator("form", settingsSchema, (r, c) => {
    if (!r.success) return back(c, `/admin/profiles/${c.req.param("id")}`, { err: zerr(r.error) });
  }),
  async (c) => {
    const p = await updateProfileSettings(intParam(c, "id"), {
      maxQuality: c.req.valid("form").max_quality,
      autoPlayNext: await checked(c, "auto_play_next"),
      rememberVersions: await checked(c, "remember_versions"),
      switchSourceOnFailure: await checked(c, "switch_source_on_failure"),
    });
    if (!p) return c.notFound();
    return back(c, `/admin/profiles/${p.id}`, { ok: "Réglages de lecture enregistrés" });
  },
);

profilesRoutes.post("/:id/apply", async (c) => {
  const p = await profileById(intParam(c, "id"));
  if (!p) return c.notFound();
  judgeInBackground(p.id);
  return back(c, `/admin/profiles/${p.id}`, { ok: `Jugement de ${p.name} lancé` });
});

profilesRoutes.post("/:id/default", async (c) => {
  const id = intParam(c, "id");
  if (!(await setDefaultProfile(id))) return c.notFound();
  return back(c, `/admin/profiles/${id}`, { ok: "Profil par défaut" });
});

profilesRoutes.post("/:id/delete", async (c) => {
  const id = intParam(c, "id");
  const r = await deleteProfile(id);
  if (r === "unknown") return c.notFound();
  if (r === "default") return back(c, `/admin/profiles/${id}`, { err: "Le profil par défaut ne se supprime pas" });
  return back(c, "/admin/profiles", { ok: "Profil supprimé" });
});
