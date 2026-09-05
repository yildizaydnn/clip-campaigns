import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests run against a real Postgres (the dedicated test database) because
// the concurrency behaviour at the core of the approval flow cannot be
// exercised with mocks. drizzle.config-style env loading: .env is optional
// so CI/deploy environments with real env vars keep working.
try {
  process.loadEnvFile(".env");
} catch {
  /* .env is optional */
}

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) throw new Error("TEST_DATABASE_URL is not set");

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Test files share one database; truncation between tests must not race
    // across files. Concurrency WITHIN a test (Promise.all over the pg pool)
    // is untouched — that is where the approval race is exercised.
    fileParallelism: false,
    env: {
      // the app's db client reads DATABASE_URL; point it at the test db
      DATABASE_URL: testDbUrl,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret",
    },
  },
});
