import { db, storesTable, shiprocketAccountsTable, whatsappAccountsTable, emailAccountsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * With exactly one Shiprocket / WhatsApp / email account there is nothing to
 * choose: stores without a linked account get that one. Runs on startup, before
 * every Shiprocket sync and whenever an account or store is added.
 */
export async function autoLinkAccounts() {
  const [sr, wa, em] = await Promise.all([
    db.select({ id: shiprocketAccountsTable.id }).from(shiprocketAccountsTable),
    db.select({ id: whatsappAccountsTable.id }).from(whatsappAccountsTable),
    db.select({ id: emailAccountsTable.id }).from(emailAccountsTable),
  ]);
  if (sr.length === 1) {
    const r = await db.update(storesTable).set({ shiprocketAccountId: sr[0].id }).where(isNull(storesTable.shiprocketAccountId)).returning({ id: storesTable.id });
    if (r.length) logger.info({ stores: r.length }, "linked stores to the only Shiprocket account");
  }
  if (wa.length === 1) await db.update(storesTable).set({ whatsappAccountId: wa[0].id }).where(isNull(storesTable.whatsappAccountId));
  if (em.length === 1) await db.update(storesTable).set({ emailAccountId: em[0].id }).where(isNull(storesTable.emailAccountId));
}
