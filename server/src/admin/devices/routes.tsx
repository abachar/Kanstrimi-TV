import { Hono } from "hono";
import type { Context } from "hono";
import {
  approvePairing,
  pairingState,
  listDevices,
  revokeDevice,
  forgetDevice,
  getDevice,
  isCode,
  pushByDevice,
  setPushPreference,
  PUSH_KINDS,
} from "@/devices";
import { isApnsConfigured, recentNotifications, sendTestNotification } from "@/notify";
import { clientIp } from "@/shared";
import { page, back, form, checked } from "../http";
import { PairView, DevicesView } from "./view";

/** `/admin/pair/{code}`, the page the TV's QR code opens. */
export const pairRoutes = new Hono();

/** Where and when the code was asked for, beside the admin's own address: a code sent by someone else shows. */
async function requestOf(c: Context, code: string) {
  const d = await getDevice(code);
  if (!d) return undefined;
  const you = clientIp(c.req.raw);
  return { at: d.createdAt, ip: d.createdIp, sameAsYou: Boolean(d.createdIp) && d.createdIp === you };
}

/** A pairing page sits under « Appareils » in the breadcrumb. */
const PAIR = { under: "/admin/devices" };

pairRoutes.get("/:code", async (c) => {
  const code = c.req
    .param("code")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!isCode(code)) return page(c, "Appairage", <PairView code={code} state="unknown" />, PAIR);
  return page(
    c,
    "Appairage",
    <PairView code={code} state={await pairingState(code)} request={await requestOf(c, code)} error={c.req.query("err")} />,
    PAIR,
  );
});
pairRoutes.post("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const f = await form(c);
  try {
    await approvePairing(code, (f.name ?? "").slice(0, 40));
  } catch (e) {
    return page(
      c,
      "Appairage",
      <PairView code={code} state={await pairingState(code)} request={await requestOf(c, code)} error={(e as Error).message} />,
      PAIR,
    );
  }
  return page(c, "Appairage", <PairView code={code} state="done" />, PAIR);
});
/** `/admin/devices`: the paired TVs. */
export const devicesRoutes = new Hono();

devicesRoutes.get("/", async (c) => {
  const devices = await listDevices();
  const [push, log] = await Promise.all([pushByDevice(devices.map((d) => d.id)), recentNotifications()]);
  return page(c, "Appareils", <DevicesView devices={devices} push={push} apns={isApnsConfigured()} log={log} />);
});
/** The two switches of a device, posted by htmx at each change (an unchecked box is absent). */
devicesRoutes.post("/:code/push", async (c) => {
  const code = c.req.param("code").toUpperCase();
  for (const kind of PUSH_KINDS) await setPushPreference(code, kind, await checked(c, kind));
  return c.body(null, 204);
});
devicesRoutes.post("/:code/push/test", async (c) => {
  const n = await sendTestNotification(c.req.param("code").toUpperCase());
  const msg = !n
    ? { err: "Cet appareil n'a pas d'enregistrement push" }
    : n.status === "sent"
      ? { ok: "Alerte de test envoyée" }
      : { err: `Alerte de test en échec : ${n.detail ?? n.status}` };
  return back(c, "/admin/devices", msg);
});
devicesRoutes.post("/:code/revoke", async (c) => {
  const ok = await revokeDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", ok ? { ok: "Appareil dissocié" } : { err: "Appareil introuvable ou déjà dissocié" });
});
devicesRoutes.post("/:code/forget", async (c) => {
  await forgetDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", { ok: "Appareil oublié" });
});
