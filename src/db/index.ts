import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { devOnly } from "@/lib/env";

const url = process.env.DATABASE_URL ?? devOnly("DATABASE_URL", "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_db");

const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };
const client = globalForDb.__pgClient ?? postgres(url, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema, client };
