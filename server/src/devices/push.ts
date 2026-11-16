import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Device, type DevicePush } from "@/db";

/** The alerts a device can receive; each one is a switch of its own in the admin. */
export type PushKind = "waitlist" | "runs";
export const PUSH_KINDS: readonly PushKind[] = ["waitlist", "runs"];
export type PushEnvironment = "sandbox" | "production";
export type PushRegistration = { platform: "ios"; token: string; environment: PushEnvironment };
export type PushTarget = { device: Device; push: DevicePush };

/** The app, at each launch: the token APNs gave it now. The admin's switches are kept across registrations. */
export async function registerPush(deviceId: number, r: PushRegistration): Promise<DevicePush> {
  const [row] = await db
    .insert(schema.appDevicePush)
    .values({ deviceId, platform: r.platform, token: r.token, environment: r.environment, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appDevicePush.deviceId,
      set: { platform: r.platform, token: r.token, environment: r.environment, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** The app, when the user turns the alerts off on the phone: no more alerts for this device. */
export async function unregisterPush(deviceId: number) {
  await db.delete(schema.appDevicePush).where(eq(schema.appDevicePush.deviceId, deviceId));
}

/** APNs said the token is gone (the app uninstalled, the token renewed): every registration holding it goes. */
export async function dropPushToken(token: string): Promise<number> {
  const rows = await db
    .delete(schema.appDevicePush)
    .where(eq(schema.appDevicePush.token, token))
    .returning({ id: schema.appDevicePush.deviceId });
  return rows.length;
}

/** Admin: one switch of a device. False when the device has no registration. */
export async function setPushPreference(code: string, kind: PushKind, on: boolean): Promise<boolean> {
  const device = await db.query.appDevices.findFirst({ where: eq(schema.appDevices.code, code) });
  if (!device) return false;
  const rows = await db
    .update(schema.appDevicePush)
    .set(kind === "waitlist" ? { waitlist: on } : { runs: on })
    .where(eq(schema.appDevicePush.deviceId, device.id))
    .returning({ id: schema.appDevicePush.deviceId });
  return rows.length > 0;
}

/** The registration of each device, by device id, for the admin's list. */
export async function pushByDevice(deviceIds: number[]): Promise<Map<number, DevicePush>> {
  if (!deviceIds.length) return new Map();
  const rows = await db.select().from(schema.appDevicePush).where(inArray(schema.appDevicePush.deviceId, deviceIds));
  return new Map(rows.map((r) => [r.deviceId, r]));
}

/** Who receives an alert of that kind: the approved devices registered with the switch on. */
export async function pushTargets(kind: PushKind): Promise<PushTarget[]> {
  const rows = await db
    .select({ device: schema.appDevices, push: schema.appDevicePush })
    .from(schema.appDevicePush)
    .innerJoin(schema.appDevices, eq(schema.appDevices.id, schema.appDevicePush.deviceId))
    .where(
      and(
        eq(schema.appDevices.status, "approved"),
        eq(kind === "waitlist" ? schema.appDevicePush.waitlist : schema.appDevicePush.runs, true),
      ),
    )
    .orderBy(schema.appDevices.id);
  return rows;
}

/** One device's registration, for a test alert from the admin. */
export async function pushTarget(code: string): Promise<PushTarget | null> {
  const [row] = await db
    .select({ device: schema.appDevices, push: schema.appDevicePush })
    .from(schema.appDevicePush)
    .innerJoin(schema.appDevices, eq(schema.appDevices.id, schema.appDevicePush.deviceId))
    .where(eq(schema.appDevices.code, code));
  return row ?? null;
}
