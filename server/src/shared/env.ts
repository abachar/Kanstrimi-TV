import path from "node:path";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

/**
 * Convenience defaults exist for local development only. In production the variable is
 * mandatory: a silent fallback would mean signing cookies with a public secret or talking
 * to the wrong database.
 */
const schema = z.object({
  ADMIN_PASSWORD_HASH: z.string({ error: "ADMIN_PASSWORD_HASH manquant dans l'environnement — générez-le avec : npm run hash-password -- <mot-de-passe>" }).regex(/^\$2[aby]\$/, "ADMIN_PASSWORD_HASH manquant ou invalide dans l'environnement — générez-le avec : npm run hash-password -- <mot-de-passe>"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET doit faire au moins 32 caractères").optional(),
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default("./data"),
  PORT: z.coerce.number().int().positive().default(3000),
}).superRefine((v, ctx) => {
  if (!isProd) return;
  for (const name of ["SESSION_SECRET", "DATABASE_URL"] as const) {
    if (!v[name]) ctx.addIssue({ code: "custom", path: [name], message: `${name} est obligatoire en production (NODE_ENV=production).` });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.issues.map((i) => i.message).join("\n"));
  process.exit(1);
}

export const env = {
  isProd,
  /** bcrypt hash of the single password (admin web + IPTV client). */
  adminPasswordHash: parsed.data.ADMIN_PASSWORD_HASH,
  sessionSecret: parsed.data.SESSION_SECRET ?? "dev-only-insecure-secret-change-me-please-32chars",
  databaseUrl: parsed.data.DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_db",
  dataDir: path.resolve(parsed.data.DATA_DIR),
  port: parsed.data.PORT,
};
