import {
  db,
  automationRulesTable,
  automationLogTable,
  ordersTable,
  checkoutsTable,
  storesTable,
  whatsappAccountsTable,
  emailAccountsTable,
  type AutomationRule,
  type Order,
  type Checkout,
  type Store,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { fillTemplate } from "../lib/contact";
import { logger } from "../lib/logger";
import { sendWhatsApp, sendEmailMessage, orderVars, checkoutVars } from "./messaging";

const MAX_AGE_HOURS = { order: 48, checkout: 72 };

/** Claim (rule, entity) so it is never sent twice, even across restarts. */
async function claim(ruleId: number, entityType: "order" | "checkout", entityId: number, key = "") {
  const rows = await db
    .insert(automationLogTable)
    .values({ ruleId, entityType, entityId, key, result: "pending" })
    .onConflictDoNothing()
    .returning({ id: automationLogTable.id });
  return rows[0]?.id ?? null;
}

async function finish(logId: number, result: string) {
  await db.update(automationLogTable).set({ result }).where(eq(automationLogTable.id, logId));
}

export function renderRule(rule: AutomationRule, vars: Record<string, string>) {
  return {
    text: fillTemplate(rule.body, vars),
    subject: rule.subject ? fillTemplate(rule.subject, vars) : "",
    template:
      rule.messageType === "template" && rule.templateName
        ? {
            name: rule.templateName,
            language: rule.templateLanguage || "en",
            params: rule.templateParams.map((p) => fillTemplate(p, vars)),
            headerImageUrl: rule.includeImage ? vars.image || null : null,
          }
        : undefined,
    imageUrl: rule.messageType === "text" && rule.includeImage ? vars.image || null : null,
  };
}

async function fire(rule: AutomationRule, entity: { type: "order"; row: Order } | { type: "checkout"; row: Checkout }, store: Store | undefined, key = "") {
  const logId = await claim(rule.id, entity.type, entity.row.id, key);
  if (!logId) return;
  const vars = entity.type === "order" ? orderVars(entity.row, store) : checkoutVars(entity.row, store);
  const r = renderRule(rule, vars);
  const common = {
    storeId: entity.row.storeId,
    orderId: entity.type === "order" ? entity.row.id : null,
    checkoutId: entity.type === "checkout" ? entity.row.id : null,
    source: `automation:${rule.id}`,
  };
  try {
    if (rule.channel === "email") {
      if (!entity.row.email) return finish(logId, "skipped: no email");
      await sendEmailMessage({ ...common, to: entity.row.email, subject: r.subject || rule.name, text: r.text });
    } else {
      if (!entity.row.phone) return finish(logId, "skipped: no phone");
      await sendWhatsApp({ ...common, to: entity.row.phone, contactName: entity.row.customerName, text: r.text, imageUrl: r.imageUrl, template: r.template });
    }
    if (entity.type === "checkout") {
      await db
        .update(checkoutsTable)
        .set({ sentSteps: sql`${checkoutsTable.sentSteps} || ${JSON.stringify([rule.name])}::jsonb` })
        .where(eq(checkoutsTable.id, entity.row.id));
    }
    await finish(logId, "sent");
  } catch (err) {
    await finish(logId, `failed: ${(err as Error).message}`.slice(0, 500));
    logger.warn({ rule: rule.name, entity: entity.type, id: entity.row.id, err: (err as Error).message }, "automation send failed");
  }
}

/** Hold rules back while no account can send on their channel, instead of burning them as failed. */
async function readyChannels() {
  const wa = await db.select({ id: whatsappAccountsTable.id }).from(whatsappAccountsTable).where(eq(whatsappAccountsTable.status, "connected")).limit(1);
  const em = await db.select({ id: emailAccountsTable.id }).from(emailAccountsTable).where(eq(emailAccountsTable.status, "connected")).limit(1);
  return { whatsapp: wa.length > 0, email: em.length > 0 };
}

export async function runAutomations() {
  const rules = await db.select().from(automationRulesTable).where(eq(automationRulesTable.enabled, true));
  if (rules.length === 0) return;
  const stores = new Map((await db.select().from(storesTable)).map((s) => [s.id, s]));
  const now = Date.now();
  const ready = await readyChannels();

  for (const rule of rules) {
    if (!ready[rule.channel]) continue;
    const storeFilter = (col: typeof ordersTable.storeId | typeof checkoutsTable.storeId) =>
      rule.storeId ? eq(col, rule.storeId) : undefined;
    const dueBefore = new Date(now - rule.delayMinutes * 60_000);

    if (rule.trigger === "order_created") {
      const rows = await db
        .select()
        .from(ordersTable)
        .where(
          and(
            storeFilter(ordersTable.storeId),
            gte(ordersTable.createdAt, new Date(Math.max(rule.createdAt.getTime(), now - MAX_AGE_HOURS.order * 3600_000))),
            sql`${ordersTable.createdAt} <= ${dueBefore}`,
            sql`${ordersTable.cancelledAt} IS NULL`,
            rule.triggerValue ? eq(ordersTable.paymentMethod, rule.triggerValue) : undefined,
            sql`NOT EXISTS (SELECT 1 FROM automation_log l WHERE l.rule_id = ${rule.id} AND l.entity_type = 'order' AND l.entity_id = ${ordersTable.id})`,
          ),
        )
        .limit(50);
      for (const o of rows) await fire(rule, { type: "order", row: o }, stores.get(o.storeId));
    }

    if (rule.trigger === "shipment_status") {
      const rows = await db
        .select()
        .from(ordersTable)
        .where(
          and(
            storeFilter(ordersTable.storeId),
            eq(ordersTable.srStatusCode, rule.triggerValue),
            isNotNull(ordersTable.srUpdatedAt),
            gte(ordersTable.srUpdatedAt, new Date(Math.max(rule.createdAt.getTime(), now - MAX_AGE_HOURS.order * 3600_000))),
            sql`${ordersTable.srUpdatedAt} <= ${dueBefore}`,
            sql`NOT EXISTS (SELECT 1 FROM automation_log l WHERE l.rule_id = ${rule.id} AND l.entity_type = 'order' AND l.entity_id = ${ordersTable.id} AND l.key = ${rule.triggerValue})`,
          ),
        )
        .limit(50);
      for (const o of rows) await fire(rule, { type: "order", row: o }, stores.get(o.storeId), rule.triggerValue);
    }

    if (rule.trigger === "abandoned_checkout") {
      const rows = await db
        .select()
        .from(checkoutsTable)
        .where(
          and(
            storeFilter(checkoutsTable.storeId),
            eq(checkoutsTable.status, "abandoned"),
            sql`${checkoutsTable.completedAt} IS NULL`,
            gte(checkoutsTable.createdAt, new Date(Math.max(rule.createdAt.getTime() - 86400_000, now - MAX_AGE_HOURS.checkout * 3600_000))),
            sql`${checkoutsTable.createdAt} <= ${dueBefore}`,
            rule.channel === "email" ? isNotNull(checkoutsTable.email) : isNotNull(checkoutsTable.phone),
            sql`NOT EXISTS (SELECT 1 FROM automation_log l WHERE l.rule_id = ${rule.id} AND l.entity_type = 'checkout' AND l.entity_id = ${checkoutsTable.id})`,
          ),
        )
        .limit(50);
      for (const c of rows) await fire(rule, { type: "checkout", row: c }, stores.get(c.storeId));
    }
  }
}

/** Send one rule's message right now to chosen orders/carts (bulk action). */
export async function sendRuleNow(ruleLike: AutomationRule, target: { orderIds?: number[]; checkoutIds?: number[] }) {
  const stores = new Map((await db.select().from(storesTable)).map((s) => [s.id, s]));
  const results: { id: number; ok: boolean; message: string }[] = [];
  const orders = target.orderIds?.length ? await db.select().from(ordersTable).where(inArray(ordersTable.id, target.orderIds)) : [];
  const checkouts = target.checkoutIds?.length ? await db.select().from(checkoutsTable).where(inArray(checkoutsTable.id, target.checkoutIds)) : [];
  const items = [
    ...orders.map((row) => ({ type: "order" as const, row, vars: orderVars(row, stores.get(row.storeId)) })),
    ...checkouts.map((row) => ({ type: "checkout" as const, row, vars: checkoutVars(row, stores.get(row.storeId)) })),
  ];
  for (const it of items) {
    const r = renderRule(ruleLike, it.vars);
    try {
      if (ruleLike.channel === "email") {
        if (!it.row.email) throw new Error("No email");
        await sendEmailMessage({
          storeId: it.row.storeId,
          to: it.row.email,
          subject: r.subject || "Update",
          text: r.text,
          orderId: it.type === "order" ? it.row.id : null,
          checkoutId: it.type === "checkout" ? it.row.id : null,
          source: "bulk",
        });
      } else {
        if (!it.row.phone) throw new Error("No phone");
        await sendWhatsApp({
          storeId: it.row.storeId,
          to: it.row.phone,
          contactName: it.row.customerName,
          text: r.text,
          imageUrl: r.imageUrl,
          template: r.template,
          orderId: it.type === "order" ? it.row.id : null,
          checkoutId: it.type === "checkout" ? it.row.id : null,
          source: "bulk",
        });
      }
      results.push({ id: it.row.id, ok: true, message: "sent" });
    } catch (err) {
      results.push({ id: it.row.id, ok: false, message: (err as Error).message });
    }
    // Pace bulk sends: WhatsApp Web bans fast bursts
    await new Promise((r) => setTimeout(r, ruleLike.channel === "whatsapp" ? 1500 : 300));
  }
  return results;
}
