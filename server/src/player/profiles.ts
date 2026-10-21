import { Hono } from "hono";
import sharp from "sharp";
import { z } from "zod";
import { listProfiles, PROFILE_QUALITIES, profileAvatar, profileById, ProfileError, updateProfileSettings } from "@/catalog";
import type { Profile } from "@/db";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import type { Profiles, ProfileSettings, ProfileWire } from "./types";

/**
 * `GET /profiles`: the household, for the app's picker; the one asking is in `/info`.
 * `PUT /profiles/me/settings`: the playback settings of the profile asking (`X-Profile`), each optional.
 */
export const profileRoutes = new Hono<Env>();
profileRoutes.get("/", async (c) => json(await profiles(c.get("ctx"))));

const settingsBody = z.object({
  max_quality: z.enum(PROFILE_QUALITIES).optional(),
  auto_play_next: z.boolean().optional(),
  remember_versions: z.boolean().optional(),
  switch_source_on_failure: z.boolean().optional(),
});
profileRoutes.put("/me/settings", async (c) => {
  const body = settingsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success)
    return fail("bad_request", "max_quality (SD, HD, FHD, 4K), auto_play_next, remember_versions, switch_source_on_failure attendus");
  const ctx = c.get("ctx");
  try {
    const p = await updateProfileSettings(ctx.profile.id, {
      maxQuality: body.data.max_quality,
      autoPlayNext: body.data.auto_play_next,
      rememberVersions: body.data.remember_versions,
      switchSourceOnFailure: body.data.switch_source_on_failure,
    });
    return p ? json(profileWire(ctx, p)) : fail("unknown_profile", "Profil inconnu");
  } catch (e) {
    if (e instanceof ProfileError) return fail("bad_request", e.message);
    throw e;
  }
});

export async function profiles(ctx: RestContext): Promise<Profiles> {
  return { profiles: (await listProfiles()).map((p) => profileWire(ctx, p)) };
}

export const profileWire = (ctx: RestContext, p: Profile): ProfileWire => ({
  id: p.id,
  name: p.name,
  is_default: p.isDefault,
  avatar: `${ctx.baseUrl}/img/avatars/${p.id}.webp?v=${p.avatarVersion}`,
  settings: settingsWire(p),
});

export const settingsWire = (p: Profile): ProfileSettings => ({
  max_quality: (PROFILE_QUALITIES as readonly string[]).includes(p.maxQuality) ? (p.maxQuality as ProfileSettings["max_quality"]) : "4K",
  auto_play_next: p.autoPlayNext,
  remember_versions: p.rememberVersions,
  switch_source_on_failure: p.switchSourceOnFailure,
});

// ---------------------------------------------------------------- the pictures

export const AVATAR_SIZE = 256;
/** Hues spread around the wheel, so two profiles without a picture rarely share a colour. */
const hue = (id: number) => (id * 137) % 360;

/** A square WebP from whatever the admin cropped: never trusted as is (a picture may carry anything). */
export async function encodeAvatar(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}

/** A profile without a picture: its initial on a plain colour, drawn by `sharp` from an SVG. */
export async function placeholderAvatar(p: Pick<Profile, "id" | "name">): Promise<Buffer> {
  const initial = [...p.name.trim()][0]?.toUpperCase() ?? "?";
  const escaped = initial.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}">
    <rect width="100%" height="100%" fill="hsl(${hue(p.id)} 45% 42%)"/>
    <text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${AVATAR_SIZE * 0.5}" font-weight="600" fill="white">${escaped}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

/**
 * `/img/avatars/{id}.webp`: a profile's picture, mounted by `app.ts` next to the other images (no token:
 * the apps draw it as they draw a poster). The URL carries `?v=` so a new picture is a new address.
 */
export const avatarRoute = new Hono();
avatarRoute.get("/:file{\\d+\\.webp}", async (c) => {
  const id = Number.parseInt(c.req.param("file"), 10);
  const profile = await profileById(id);
  if (!profile) return c.text("Not found", 404);
  const body = (await profileAvatar(id)) ?? (await placeholderAvatar(profile));
  return c.body(new Uint8Array(body), 200, {
    "Content-Type": "image/webp",
    "Cache-Control": c.req.query("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
    "Content-Security-Policy": "sandbox",
  });
});
