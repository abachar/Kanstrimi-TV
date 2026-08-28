import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_db" }, // dev only: db:generate never runs in production
});
