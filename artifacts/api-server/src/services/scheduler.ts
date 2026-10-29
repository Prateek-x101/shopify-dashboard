import { db, storesTable, shiprocketAccountsTable, emailAccountsTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { syncStoreOrders, syncStoreCheckouts } from "../integrations/shopify";
import { syncShiprocketAccount } from "../integrations/shiprocket";
import { fetchNewEmails, logEmailError } from "../integrations/email";
import { handleInboundEmails } from "./messaging";
import { runAutomations } from "./automation";
import { syncSheets } from "./sheets";
import { autoLinkAccounts } from "./linking";
import { fulfillPending } from "./fulfillment";
import { logger } from "../lib/logger";

const running = new Set<string>();

/** Run a job unless the previous run of the same job is still going. */
async function once(name: string, fn: () => Promise<unknown>) {
  if (running.has(name)) return;
  running.add(name);
  try {
    await fn();
  } catch (err) {
    logger.warn({ job: name, err: (err as Error).message }, "job failed");
  } finally {
    running.delete(name);
  }
}

export async function syncShopifyAll(storeId?: number) {
  const stores = await db.select().from(storesTable).where(eq(storesTable.active, true));
  for (const s of stores.filter((x) => !storeId || x.id === storeId)) {
    await once(`shopify:${s.id}`, async () => {
      try {
        const n = await syncStoreOrders(s);
        const c = await syncStoreCheckouts(s);
        if (n || c) logger.info({ store: s.name, orders: n, checkouts: c }, "shopify sync");
      } catch (err) {
        await db.update(storesTable).set({ lastError: (err as Error).message }).where(eq(storesTable.id, s.id));
        throw err;
      }
    });
  }
}

export async function syncShiprocketAll(accountId?: number) {
  await autoLinkAccounts().catch(() => {});
  const accounts = await db.select().from(shiprocketAccountsTable);
  for (const a of accounts.filter((x) => !accountId || x.id === accountId)) {
    await once(`shiprocket:${a.id}`, async () => {
      try {
        await syncShiprocketAccount(a);
      } catch (err) {
        await db.update(shiprocketAccountsTable).set({ lastError: (err as Error).message }).where(eq(shiprocketAccountsTable.id, a.id));
        throw err;
      }
    });
  }
}

export async function pollEmailAll() {
  const accounts = await db.select().from(emailAccountsTable).where(isNotNull(emailAccountsTable.imapHost));
  for (const a of accounts) {
    await once(`email:${a.id}`, async () => {
      try {
        await handleInboundEmails(await fetchNewEmails(a));
      } catch (err) {
        await logEmailError(a, err);
      }
    });
  }
}

export function startScheduler() {
  const every = (ms: number, fn: () => Promise<unknown>) => {
    setTimeout(() => fn().catch(() => {}), 5_000);
    setInterval(() => fn().catch(() => {}), ms);
  };
  every(3 * 60_000, () => syncShopifyAll());
  every(5 * 60_000, () => syncShiprocketAll());
  every(2 * 60_000, () => pollEmailAll());
  every(60_000, () => once("automation", runAutomations));
  every(60_000, () => once("shopify-fulfil", () => fulfillPending()));
  every(10 * 60_000, () => once("sheets", () => syncSheets()));
  logger.info("scheduler started (shopify 3m, shiprocket 5m, email 2m, automation 1m, sheets 10m)");
}
