import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}
