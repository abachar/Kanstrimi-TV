import { Hono } from "hono";
import { z } from "zod";
import { getSettings } from "@/config";
import { createPairing, pollPairing, revokeDevice, isCode, registerPush, unregisterPush } from "@/devices";
import { publicBaseUrl, type Env } from "./context";
import { clientIp } from "@/shared";
import { fail, json, noContent } from "./http";

/** `/devices`: pairing by code (no token), a TV unpairing itself, and the push registration of a phone (token). */

export const pairingRoutes = new Hono<Env>();

pairingRoutes.post("/", async (c) => {
  const s = await getSettings();
  const { code, expiresAt, token } = await createPairing(clientIp(c.req.raw));
  return json({ code, expires_at: expiresAt.toISOString(), url: `${publicBaseUrl(c.req.raw, s)}/admin/pair/${code}`, token }, 201);
});
pairingRoutes.get("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!isCode(code)) return fail("bad_request", "Code invalide");
  const r = await pollPairing(code);
  return json(r.status === "approved" ? { status: "approved", device_name: r.deviceName } : r);
});

export const deviceRoutes = new Hono<Env>();

/** The APNs token is 32 bytes in hex (64 characters); nothing else is taken. */
const pushBody = z.object({
  platform: z.literal("ios"),
  token: z.string().regex(/^[0-9a-f]{64}$/i),
  environment: z.enum(["sandbox", "production"]),
});

/** `PUT /devices/me/push`: the token of this device, sent at each launch. */
deviceRoutes.put("/me/push", async (c) => {
  const body = pushBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "Enregistrement push invalide");
  await registerPush(c.get("device").id, { ...body.data, token: body.data.token.toLowerCase() });
  return noContent();
});
/** `DELETE /devices/me/push`: the alerts turned off on the phone. */
deviceRoutes.delete("/me/push", async (c) => {
  await unregisterPush(c.get("device").id);
  return noContent();
});

deviceRoutes.delete("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  // Only its own: a TV cannot unpair another one.
  if (code !== c.get("device").code) return fail("not_found", "Appareil inconnu");
  await revokeDevice(code);
  return noContent();
});
