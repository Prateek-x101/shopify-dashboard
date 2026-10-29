import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * trigger:
 *  - order_created        → new Shopify order (triggerValue: "COD" | "Prepaid" | "" for all)
 *  - shipment_status      → Shiprocket status changed (triggerValue: normalised status key)
 *  - abandoned_checkout   → cart abandoned; delayMinutes after abandonment, ordered by stepOrder
 */
export const automationRulesTable = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  storeId: integer("store_id"), // null = all stores
  trigger: text("trigger", { enum: ["order_created", "shipment_status", "abandoned_checkout"] }).notNull(),
  triggerValue: text("trigger_value").notNull().default(""),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  channel: text("channel", { enum: ["whatsapp", "email"] }).notNull().default("whatsapp"),
  // text: free text body (WhatsApp Web / within 24h window / email)
  // template: Meta approved template
  messageType: text("message_type", { enum: ["text", "template"] }).notNull().default("text"),
  body: text("body").notNull().default(""),
  subject: text("subject"),
  templateName: text("template_name"),
  templateLanguage: text("template_language").default("en"),
  templateParams: jsonb("template_params").$type<string[]>().notNull().default([]),
  includeImage: boolean("include_image").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Dedupe log: a rule fires at most once per entity
export const automationLogTable = pgTable(
  "automation_log",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id").notNull(),
    entityType: text("entity_type", { enum: ["order", "checkout"] }).notNull(),
    entityId: integer("entity_id").notNull(),
    key: text("key").notNull().default(""),
    result: text("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("automation_log_uq").on(t.ruleId, t.entityType, t.entityId, t.key)],
);

export type AutomationRule = typeof automationRulesTable.$inferSelect;
