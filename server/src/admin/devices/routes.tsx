import { Hono } from "hono";
import type { Context } from "hono";
import { approvePairing, pairingState, listDevices, revokeDevice, forgetDevice, getDevice, isCode } from "@/devices";
import { clientIp } from "@/shared";
import { page, back, form } from "../http";
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

devicesRoutes.get("/", async (c) => page(c, "Appareils", <DevicesView devices={await listDevices()} />));
devicesRoutes.post("/:code/revoke", async (c) => {
  const ok = await revokeDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", ok ? { ok: "Appareil dissocié" } : { err: "Appareil introuvable ou déjà dissocié" });
});
devicesRoutes.post("/:code/forget", async (c) => {
  await forgetDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", { ok: "Appareil oublié" });
});
