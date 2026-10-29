import fs from "fs";
import path from "path";

export function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export const WORKSPACE_ROOT = findWorkspaceRoot(__dirname);

// Everything local and private (database, WhatsApp Web sessions) lives here.
export const DATA_DIR = process.env.DATA_DIR ?? path.join(WORKSPACE_ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const MIGRATIONS_DIR = path.join(WORKSPACE_ROOT, "lib/db/drizzle");
export const FRONTEND_DIR = path.join(WORKSPACE_ROOT, "artifacts/shopify-dashboard/dist/public");

export const SHOPIFY_API_VERSION = "2025-07";
