import { describe, it, expect } from "vitest";
import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import { ApnsClient, DEAD_TOKEN_REASONS, payload, providerToken, TOPIC, type ApnsResult } from "../apns";
import { runAlert, waitlistAlert } from "../texts";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const cfg = { key: pem, keyId: "ABC123DEFG", teamId: "LAG58JZG7G" };

describe("APNs provider token", () => {
  it("is a JWT ES256 with the key id and the team, verifiable with the public key", () => {
    const jwt = providerToken(cfg, createPrivateKey(pem), 1_791_700_000_000);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "LAG58JZG7G", iat: 1_791_700_000 });
    const ok = verify(
      "sha256",
      Buffer.from(`${head}.${claims}`),
      { key: privateKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("the payload carries the alert, the sound and the link the app opens", () => {
    expect(JSON.parse(payload({ title: "T", body: "B", link: "kanstrimi://open/tmdb:movie:1" }))).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default" },
      link: "kanstrimi://open/tmdb:movie:1",
    });
    expect(JSON.parse(payload({ title: "T", body: "B", badge: 2 }))).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default", badge: 2 },
    });
  });

  it("sends with the topic and the bearer, keeps the token fifty minutes, renews it when APNs says it expired", async () => {
    const calls: { env: string; token: string; headers: Record<string, string>; body: string }[] = [];
    let answer: ApnsResult = { ok: true };
    let clock = 1_791_700_000_000;
    const client = new ApnsClient(
      cfg,
      async (env, token, headers, body) => {
        calls.push({ env, token, headers, body });
        return answer;
      },
      () => clock,
    );
    expect(await client.send("sandbox", "ff".repeat(32), { title: "T", body: "B" })).toEqual({ ok: true });
    expect(calls[0].env).toBe("sandbox");
    expect(calls[0].token).toBe("ff".repeat(32));
    expect(calls[0].headers["apns-topic"]).toBe(TOPIC);
    expect(calls[0].headers["apns-push-type"]).toBe("alert");
    expect(calls[0].headers.authorization).toMatch(/^bearer ey/);
    clock += 10 * 60 * 1000;
    await client.send("production", "ee".repeat(32), { title: "T", body: "B" });
    expect(calls[1].headers.authorization).toBe(calls[0].headers.authorization); // within the hour: the same token
    clock += 45 * 60 * 1000;
    await client.send("production", "ee".repeat(32), { title: "T", body: "B" });
    expect(calls[2].headers.authorization).not.toBe(calls[0].headers.authorization);
    // Refused as expired: renewed and sent again at once.
    const expired: ApnsResult = { ok: false, status: 403, reason: "ExpiredProviderToken" };
    answer = expired;
    const p = client.send("sandbox", "ff".repeat(32), { title: "T", body: "B" });
    answer = { ok: true };
    expect(await p).toEqual({ ok: true });
    expect(calls).toHaveLength(5);
    expect(calls[4].headers.authorization).not.toBe(calls[3].headers.authorization);
    answer = { ok: false, status: 410, reason: "Unregistered" };
    expect(await client.send("sandbox", "ff".repeat(32), { title: "T", body: "B" })).toEqual(answer);
    expect(DEAD_TOKEN_REASONS.has("Unregistered")).toBe(true);
  });
});

describe("alert texts", () => {
  it("a waitlist arrival names the film and opens its sheet", () => {
    expect(waitlistAlert({ contentKey: "tmdb:movie:1100", title: "Dune : Troisième partie", year: 2026 })).toEqual({
      title: "Film attendu arrivé",
      body: "Dune : Troisième partie (2026) est disponible.",
      link: "kanstrimi://open/tmdb:movie:1100",
    });
    expect(waitlistAlert({ contentKey: "tmdb:movie:1", title: "Sans année", year: null }).body).toBe("Sans année est disponible.");
  });

  it("a finished run sums its steps up: length, arrivals and departures, TMDB matches, waitlist", () => {
    const startedAt = new Date("2026-10-11T04:00:00Z");
    const run = {
      status: "success" as const,
      message: null,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 32 * 60_000),
      steps: [
        { step: "source", status: "success", stats: { items_added: 12, items_updated: 40, items_removed: 1 } },
        { step: "enrich", status: "success", stats: { matched: 8, unmatched: 2 } },
        { step: "group", status: "success", stats: { waitlist_available: 1 } },
        { step: "filters", status: "success", stats: { variants_hidden: 3, waitlist_available: 0 } },
      ],
    };
    expect(runAlert(run)).toEqual({
      title: "Traitement complet terminé",
      body: "32 min · 12 ajoutés, 1 supprimé · 8 fiches TMDB associées · 1 attendu arrivé",
    });
    expect(runAlert({ ...run, steps: [{ step: "source", status: "success", stats: { items_added: 0, items_removed: 0 } }] }).body).toBe(
      "32 min · rien de nouveau",
    );
    expect(
      runAlert({
        ...run,
        status: "error",
        message: "Serveur Xtream injoignable",
        finishedAt: new Date(startedAt.getTime() + 20_000),
        steps: [],
      }),
    ).toEqual({
      title: "Traitement complet en échec",
      body: "moins d'une minute · Serveur Xtream injoignable",
    });
    expect(runAlert({ ...run, status: "killed", message: "Arrêté depuis l'admin", steps: [] }).title).toBe("Traitement complet arrêté");
  });
});
