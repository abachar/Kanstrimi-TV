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
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://kanstrimi:kanstrimi@localhost:5432/kanstrimi_test",
      ADMIN_PASSWORD_HASH: "$2b$10$CwTycUXWue0Thq9StjUM0uJ8Z0Y0S5uKm9O8bYwzGf0Kf7rM.a7Ri", // "test"
      SESSION_SECRET: "test-only-secret-not-for-production-32chars",
      DATA_DIR: "/tmp/kanstrimi-test-data",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
