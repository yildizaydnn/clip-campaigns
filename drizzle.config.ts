import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so .env is not loaded for us.
// loadEnvFile is a no-op guard: in environments where the URL comes from
// real env vars (deploy, CI) the file does not exist and that is fine.
try {
  process.loadEnvFile(".env");
} catch {
  /* .env is optional */
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
