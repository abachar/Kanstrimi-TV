import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/shared";

const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };
const client = globalForDb.__pgClient ?? postgres(env.databaseUrl, { max: 10, prepare: false });
if (!env.isProd) globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema, client };
