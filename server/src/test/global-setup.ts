import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/** Migrate the test database once per run. Unreachable → every DB test fails with this message. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_test";
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  } catch (e) {
    console.error(`[test] base de test injoignable ou migration échouée (${url.replace(/:[^:@/]+@/, ":***@")}) : ${(e as Error).message}`);
    throw e;
  } finally {
    await client.end({ timeout: 5 });
  }
}
