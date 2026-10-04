import { describe, it, expect } from "vitest";
import { parseEnv } from "../env";

const hash = "$2b$04$5/zpgMxPMh1UdeIEbJ8/jux0XzSTWJE/.6fHMMMb47MeNOrHhPiF.";
const production = {
  NODE_ENV: "production",
  ADMIN_PASSWORD_HASH: hash,
  ADMIN_EMAIL: "admin@kanstrimi.test",
  SESSION_SECRET: "a-production-secret-of-at-least-32-chars",
  DATABASE_URL: "postgres://u:p@db:5432/kanstrimi",
};
const messages = (raw: Record<string, string | undefined>) => {
  const r = parseEnv(raw);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("parseEnv", () => {
  it("accepts a complete production environment", () => {
    expect(parseEnv(production).success).toBe(true);
  });

  it("refuses to start in production without a session secret, or with a short one", () => {
    expect(messages({ ...production, SESSION_SECRET: undefined })).toEqual([
      "SESSION_SECRET est obligatoire en production (NODE_ENV=production).",
    ]);
    expect(messages({ ...production, SESSION_SECRET: "too-short" })).toEqual(["SESSION_SECRET doit faire au moins 32 caractères"]);
  });

  it("refuses to start in production without the admin email or the database", () => {
    expect(messages({ ...production, ADMIN_EMAIL: undefined })).toEqual([
      "ADMIN_EMAIL est obligatoire en production (NODE_ENV=production).",
    ]);
    expect(messages({ ...production, DATABASE_URL: undefined })).toEqual([
      "DATABASE_URL est obligatoire en production (NODE_ENV=production).",
    ]);
  });

  it("refuses the dev password in production, and the missing admin hash anywhere", () => {
    expect(messages({ ...production, DEV_PASSWORD: "x" })).toHaveLength(1);
    expect(parseEnv({ ...production, ADMIN_PASSWORD_HASH: undefined }).success).toBe(false);
  });

  it("lets development fall back on its defaults", () => {
    expect(parseEnv({ ADMIN_PASSWORD_HASH: hash }).success).toBe(true);
  });
});
