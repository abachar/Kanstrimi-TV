import http2 from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * Apple Push Notification service over HTTP/2, with a provider token (JWT ES256 signed with the
 * `.p8` key of the developer account): no certificate, one key for every app of the team. A token
 * is good for an hour and must not be renewed more than once every twenty minutes: it is kept
 * fifty minutes. The alerts of the app come from here only.
 */
export type ApnsConfig = { key: string; keyId: string; teamId: string };
export type ApnsEnvironment = "sandbox" | "production";
export type ApnsAlert = { title: string; body: string; link?: string | null; badge?: number };
/** APNs' answer: `ok`, or its reason (`BadDeviceToken`, `Unregistered`, `ExpiredProviderToken`…). */
export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string };
/** One request on the wire; replaced in the tests. */
export type ApnsTransport = (env: ApnsEnvironment, token: string, headers: Record<string, string>, body: string) => Promise<ApnsResult>;

export const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};
/** The alert goes to the app itself. */
export const TOPIC = "dev.crafters.kanstrimi";
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;
/** APNs reasons that mean the device token is dead: the registration holding it is dropped. */
export const DEAD_TOKEN_REASONS: ReadonlySet<string> = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** The provider token: `{ alg: ES256, kid }` · `{ iss: team, iat }`, signed with the key. */
export function providerToken(cfg: ApnsConfig, key: KeyObject, now = Date.now()): string {
  const head = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${b64url(signature)}`;
}

/** The body of an alert: title and text, the sound, the `link` the app opens on tap. */
export function payload(alert: ApnsAlert): string {
  return JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
      ...(alert.badge !== undefined ? { badge: alert.badge } : {}),
    },
    ...(alert.link ? { link: alert.link } : {}),
  });
}

/** One HTTP/2 request, a session opened for it and closed after: alerts are rare, a kept session would idle out. */
export const http2Transport: ApnsTransport = (env, token, headers, body) =>
  new Promise((resolve, reject) => {
    const session = http2.connect(HOSTS[env]);
    const done = (r: ApnsResult | Error) => {
      session.close();
      r instanceof Error ? reject(r) : resolve(r);
    };
    session.on("error", done);
    const req = session.request({ ":method": "POST", ":path": `/3/device/${token}`, "content-type": "application/json", ...headers });
    let status = 0;
    const chunks: Buffer[] = [];
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (status === 200) return done({ ok: true });
      let reason = `HTTP ${status}`;
      try {
        reason = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: string }).reason ?? reason;
      } catch {}
      done({ ok: false, status, reason });
    });
    req.on("error", done);
    req.setTimeout(15_000, () => done(new Error("APNs : délai dépassé")));
    req.end(body);
  });

/** The client of one key: its provider token, renewed in time. */
export class ApnsClient {
  private readonly key: KeyObject;
  private token: { value: string; at: number } | null = null;

  constructor(
    private readonly cfg: ApnsConfig,
    private readonly transport: ApnsTransport = http2Transport,
    private readonly now: () => number = Date.now,
  ) {
    this.key = createPrivateKey(cfg.key);
  }

  private bearer(): string {
    const t = this.now();
    if (!this.token || t - this.token.at > TOKEN_LIFETIME_MS) this.token = { value: providerToken(this.cfg, this.key, t), at: t };
    return this.token.value;
  }

  /** Sends one alert to one device token. Throws only when APNs could not be reached. */
  async send(env: ApnsEnvironment, deviceToken: string, alert: ApnsAlert): Promise<ApnsResult> {
    const headers = {
      authorization: `bearer ${this.bearer()}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(this.now() / 1000) + 24 * 3600),
    };
    const r = await this.transport(env, deviceToken, headers, payload(alert));
    // A token APNs refuses as stale is renewed once, on the spot.
    if (!r.ok && r.reason === "ExpiredProviderToken") {
      this.token = null;
      return this.transport(env, deviceToken, { ...headers, authorization: `bearer ${this.bearer()}` }, payload(alert));
    }
    return r;
  }
}
