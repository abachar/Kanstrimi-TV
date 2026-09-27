import { Hono } from "hono";
import { approvePairing, pairingState, listDevices, revokeDevice, forgetDevice, isCode } from "@/devices";
import { page, back, form } from "../http";
import { PairView, DevicesView } from "./view";

/** `/admin/pair/{code}`, the page the TV's QR code opens. */
export const pairRoutes = new Hono();

pairRoutes.get("/:code", async (c) => {
  const code = c.req
    .param("code")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!isCode(code)) return page(c, "Appairage", <PairView code={code} state="unknown" />);
  return page(c, "Appairage", <PairView code={code} state={await pairingState(code)} error={c.req.query("err")} />);
});
pairRoutes.post("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const f = await form(c);
  try {
    await approvePairing(code, (f.name ?? "").slice(0, 40));
  } catch (e) {
    return page(c, "Appairage", <PairView code={code} state={await pairingState(code)} error={(e as Error).message} />);
  }
  return page(c, "Appairage", <PairView code={code} state="done" />);
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
