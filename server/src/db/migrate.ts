import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Standalone migration runner, executed before the server starts.
 * It deliberately imports neither `@/db` nor `@/lib/env`: env.ts exits when
 * ADMIN_PASSWORD_HASH is missing, and migrating has no business knowing the admin password.
 * The migrations folder is resolved from this file, never from the cwd.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL manquant");
  process.exit(1);
}

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  console.log(`[migrate] application des migrations depuis ${folder}`);
  await migrate(drizzle(client), { migrationsFolder: folder });
  console.log("[migrate] à jour");
} catch (e) {
  console.error("[migrate] échec:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
