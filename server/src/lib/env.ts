import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * A convenience default for local development. In production the variable is mandatory:
 * a silent fallback would mean signing cookies with a public secret or talking to the
 * wrong database.
 */
export function devOnly(name: string, fallback: string): string {
  if (isProd) fail(`${name} est obligatoire en production (NODE_ENV=production).`);
  return fallback;
}

const hash = process.env.ADMIN_PASSWORD_HASH ?? "";
if (!/^\$2[aby]\$/.test(hash)) {
  fail("ADMIN_PASSWORD_HASH manquant ou invalide dans l'environnement — générez-le avec : npm run hash-password -- <mot-de-passe>");
}

export const env = {
  sessionSecret: process.env.SESSION_SECRET
    ?? devOnly("SESSION_SECRET", "dev-only-insecure-secret-change-me-please-32chars"),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  /** bcrypt hash of the single password (admin web + IPTV client). */
  adminPasswordHash: hash,
  isProd,
};
