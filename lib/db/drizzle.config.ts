import { defineConfig } from "drizzle-kit";

// Migrations are generated offline (`pnpm --filter @workspace/db run generate`)
// and applied automatically by the API server on startup.
export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
