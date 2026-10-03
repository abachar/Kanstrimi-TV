import { Hono } from "hono";
import { getSettings } from "@/config";
import { createPairing, pollPairing, revokeDevice, isCode } from "@/devices";
import { publicBaseUrl, type Env } from "./context";
import { clientIp } from "@/shared";
import { fail, json, noContent } from "./http";

/** `/devices`: pairing by code (no token), and a TV unpairing itself (token). */

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

deviceRoutes.delete("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  // Only its own: a TV cannot unpair another one.
  if (code !== c.get("device").code) return fail("not_found", "Appareil inconnu");
  await revokeDevice(code);
  return noContent();
});
