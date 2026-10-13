import type { MiddlewareHandler } from "hono";
import { getSettings } from "@/config";
import { authenticateToken } from "@/devices";
import { defaultProfile, profileById } from "@/catalog";
import { contextFor, type Env } from "./context";
import { clientIp } from "@/shared";
import { fail } from "./http";

/**
 * `Authorization: Bearer dvc_…` → the approved device, or 401. `X-Profile: <id>` → the profile the
 * app is on; absent, the default one; unknown (deleted since), `unknown_profile`: the app picks again.
 */
export const bearer = (): MiddlewareHandler<Env> => async (c, next) => {
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
  const device = token ? await authenticateToken(token, clientIp(c.req.raw)) : null;
  if (!device) return fail("unauthorized", "Appareil inconnu ou dissocié");
  const header = c.req.header("x-profile");
  const profile = header === undefined ? await defaultProfile() : /^\d+$/.test(header) ? await profileById(Number(header)) : null;
  if (!profile) return fail("unknown_profile", "Profil inconnu");
  c.set("device", device);
  c.set("ctx", await contextFor(c.req.raw, device, await getSettings(), profile));
  await next();
};
