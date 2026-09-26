import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests that touch the database run against a dedicated one (never the dev database):
 * `TEST_DATABASE_URL`, or `kanstrimi_test` on the local Postgres. The global setup
 * migrates it; each test file truncates what it uses.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["src/test/global-setup.ts"],
    // One shared test database: files must not truncate it under each other.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_test",
      ADMIN_PASSWORD_HASH: "$2b$04$5/zpgMxPMh1UdeIEbJ8/jux0XzSTWJE/.6fHMMMb47MeNOrHhPiF.", // "test", cost 4
      SESSION_SECRET: "test-only-secret-not-for-production-32chars",
      DATA_DIR: "/tmp/kanstrimi-test-data",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
