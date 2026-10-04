import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

/**
 * Convenience defaults exist for local development only. In production the variable is
 * mandatory: a silent fallback would mean signing cookies with a public secret or talking
 * to the wrong database.
 */
const schema = z
  .object({
    ADMIN_PASSWORD_HASH: z
      .string({ error: "ADMIN_PASSWORD_HASH manquant dans l'environnement — générez-le avec : npm run hash-password -- <mot-de-passe>" })
      .regex(
        /^\$2[aby]\$/,
        "ADMIN_PASSWORD_HASH manquant ou invalide dans l'environnement — générez-le avec : npm run hash-password -- <mot-de-passe>",
      ),
    /** The login of the admin form, next to the password. */
    ADMIN_EMAIL: z.email("ADMIN_EMAIL invalide").optional(),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET doit faire au moins 32 caractères").optional(),
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    DATA_DIR: z.string().default("./data"),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Local development only: logs the admin in without the login page. */
    DEV_PASSWORD: z.string().optional(),
    /** The provider account and the TMDB key: podman secrets in production, never stored in the database. */
    XTREAM_URL: z.string().trim().default(""),
    XTREAM_USERNAME: z.string().trim().default(""),
    XTREAM_PASSWORD: z.string().default(""),
    TMDB_API_KEY: z.string().trim().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== "production") return;
    if (v.DEV_PASSWORD)
      ctx.addIssue({ code: "custom", path: ["DEV_PASSWORD"], message: "DEV_PASSWORD est interdit en production (NODE_ENV=production)." });
    for (const name of ["SESSION_SECRET", "DATABASE_URL", "ADMIN_EMAIL"] as const) {
      if (!v[name]) ctx.addIssue({ code: "custom", path: [name], message: `${name} est obligatoire en production (NODE_ENV=production).` });
    }
  });

/** The validation of the environment, apart from the process: what the tests exercise. */
export const parseEnv = (raw: Record<string, string | undefined>) => schema.safeParse(raw);

const parsed = parseEnv(process.env);
if (!parsed.success) {
  console.error(parsed.error.issues.map((i) => i.message).join("\n"));
  process.exit(1);
}

export const env = {
  isProd,
  /** bcrypt hash of the admin password. */
  adminPasswordHash: parsed.data.ADMIN_PASSWORD_HASH,
  /** Required with the password by the admin login form (compared case-insensitively). */
  adminEmail: (parsed.data.ADMIN_EMAIL ?? "admin@localhost").toLowerCase(),
  sessionSecret: parsed.data.SESSION_SECRET ?? "dev-only-insecure-secret-change-me-please-32chars",
  databaseUrl: parsed.data.DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_db",
  dataDir: path.resolve(parsed.data.DATA_DIR),
  port: parsed.data.PORT,
  /** Set (outside production) = no login page, and the admin pages reload themselves after every restart. */
  devPassword: isProd ? undefined : parsed.data.DEV_PASSWORD,
  /** The provider account and the TMDB key, as `getSettings` hands them out. */
  secrets: {
    xtream_url: parsed.data.XTREAM_URL,
    xtream_username: parsed.data.XTREAM_USERNAME,
    xtream_password: parsed.data.XTREAM_PASSWORD,
    tmdb_api_key: parsed.data.TMDB_API_KEY,
  },
  /** Changes at every start: what the dev reload poll compares. */
  bootId: randomBytes(6).toString("hex"),
};
