import { Router } from "express";
import { db, automationRulesTable, automationLogTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();
const r = automationRulesTable;

const keys = ["name", "storeId", "trigger", "triggerValue", "delayMinutes", "channel", "messageType", "body", "subject", "templateName", "templateLanguage", "templateParams", "includeImage", "enabled"] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k] === "" && k === "storeId" ? null : body[k];
  return out as Partial<typeof r.$inferInsert>;
}

router.get("/automations", async (_req, res) => {
  const rules = await db.select().from(r).orderBy(r.trigger, r.delayMinutes, r.id);
  const stats = await db
    .select({
      ruleId: automationLogTable.ruleId,
      sent: sql<number>`count(*) filter (where ${automationLogTable.result} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${automationLogTable.result} like 'failed%')::int`,
      last: sql<string>`max(${automationLogTable.createdAt})`,
    })
    .from(automationLogTable)
    .groupBy(automationLogTable.ruleId);
  const byRule = new Map(stats.map((s) => [s.ruleId, s]));
  res.json(rules.map((x) => ({ ...x, stats: byRule.get(x.id) ?? { sent: 0, failed: 0, last: null } })));
});

router.post("/automations", async (req, res) => {
  const data = pick(req.body ?? {});
  if (!data.name || !data.trigger) {
    res.status(400).json({ error: "Name and trigger are required" });
    return;
  }
  const [row] = await db.insert(r).values(data as typeof r.$inferInsert).returning();
  res.json(row);
});

router.patch("/automations/:id", async (req, res) => {
  const [row] = await db.update(r).set(pick(req.body ?? {})).where(eq(r.id, Number(req.params.id))).returning();
  res.json(row);
});

router.delete("/automations/:id", async (req, res) => {
  await db.delete(r).where(eq(r.id, Number(req.params.id)));
  res.json({ ok: true });
});

router.get("/automations/:id/log", async (req, res) => {
  const rows = await db
    .select()
    .from(automationLogTable)
    .where(eq(automationLogTable.ruleId, Number(req.params.id)))
    .orderBy(desc(automationLogTable.createdAt))
    .limit(100);
  res.json(rows);
});

export default router;
