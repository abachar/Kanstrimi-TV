import type { MiddlewareHandler } from "hono";
import { getSettings } from "@/config";
import { authenticateToken } from "@/devices";
import { contextFor, type Env } from "./context";
import { clientIp } from "@/shared";
import { fail } from "./http";

/** `Authorization: Bearer dvc_…` → the approved device, or 401. Unlocks the vault on the way after a restart. */
export const bearer = (): MiddlewareHandler<Env> => async (c, next) => {
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
  const device = token ? await authenticateToken(token, clientIp(c.req.raw)) : null;
  if (!device) return fail("unauthorized", "Appareil inconnu ou dissocié");
  c.set("device", device);
  c.set("ctx", contextFor(c.req.raw, device, await getSettings()));
  await next();
};
