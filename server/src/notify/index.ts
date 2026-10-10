import { desc, eq } from "drizzle-orm";
import { db, schema, type Notification } from "@/db";
import { dropPushToken, pushTarget, pushTargets, type PushKind, type PushTarget } from "@/devices";
import { describeError, env } from "@/shared";
import { ApnsClient, DEAD_TOKEN_REASONS, type ApnsAlert, type ApnsConfig, type ApnsTransport } from "./apns";
import { runAlert, testAlert, waitlistAlert, type Arrival, type RunSummary } from "./texts";

/**
 * The alerts of the app: « Film attendu arrivé » and « Traitement complet terminé », each a switch
 * per device in the admin, sent through APNs and journalled in `notifications`. The catalogue
 * never calls this block: `main.ts` wires its events to `notifyArrivals` and `notifyRunFinished`.
 */
export type NotificationKind = PushKind | "test";
export type NotificationRow = Notification & { deviceName: string | null };

let client: ApnsClient | null = null;
let config: ApnsConfig | null = env.apns;
let transport: ApnsTransport | undefined;

export const isApnsConfigured = () => config !== null;

/** Tests: a key and a transport of their own. */
export function configureApnsForTests(cfg: ApnsConfig | null, t?: ApnsTransport) {
  config = cfg;
  transport = t;
  client = null;
}

function apns(): ApnsClient | null {
  if (!config) return null;
  client ??= new ApnsClient(config, transport);
  return client;
}

/** One alert to one device, journalled whatever happens; a dead token drops the registration. */
async function deliver(kind: NotificationKind, target: PushTarget, alert: ApnsAlert): Promise<Notification> {
  const a = apns();
  let status = "failed";
  let detail: string | null = null;
  if (!a) detail = "APNs non configuré";
  else {
    try {
      const r = await a.send(target.push.environment as "sandbox" | "production", target.push.token, alert);
      if (r.ok) status = "sent";
      else {
        detail = r.reason;
        if (DEAD_TOKEN_REASONS.has(r.reason)) {
          status = "unregistered";
          await dropPushToken(target.push.token);
        }
      }
    } catch (e) {
      detail = describeError(e);
    }
  }
  if (status !== "sent") console.warn(`[notify] ${kind} → ${target.device.name ?? target.device.code} : ${status} (${detail})`);
  const [row] = await db
    .insert(schema.notifications)
    .values({ deviceId: target.device.id, kind, title: alert.title, body: alert.body, link: alert.link ?? null, status, detail })
    .returning();
  return row;
}

/** Every device with the switch on, one after the other (a few phones, not a fleet). */
async function broadcast(kind: PushKind, alert: ApnsAlert) {
  for (const target of await pushTargets(kind)) await deliver(kind, target, alert);
}

/** Films of the waitlist the catalogue now carries: one alert per film. */
export async function notifyArrivals(arrivals: Arrival[]) {
  for (const a of arrivals) await broadcast("waitlist", waitlistAlert(a));
}

/** The pipeline ended: its summary. */
export async function notifyRunFinished(run: RunSummary) {
  await broadcast("runs", runAlert(run));
}

/** Admin: « Envoyer un test » on a device. Null when the device has no registration. */
export async function sendTestNotification(code: string): Promise<Notification | null> {
  const target = await pushTarget(code);
  if (!target) return null;
  return deliver("test", target, testAlert(target.device.name ?? target.device.code));
}

/** The admin's log: the latest alerts, the device's name beside each. */
export async function recentNotifications(limit = 30): Promise<NotificationRow[]> {
  const rows = await db
    .select({ n: schema.notifications, deviceName: schema.appDevices.name })
    .from(schema.notifications)
    .leftJoin(schema.appDevices, eq(schema.appDevices.id, schema.notifications.deviceId))
    .orderBy(desc(schema.notifications.id))
    .limit(limit);
  return rows.map((r) => ({ ...r.n, deviceName: r.deviceName }));
}

export type { Arrival, RunSummary } from "./texts";
export { runAlert, waitlistAlert } from "./texts";
