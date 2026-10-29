import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// Shiprocket login (one account can serve several stores)
export const shiprocketAccountsTable = pgTable("shiprocket_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  pickupLocation: text("pickup_location").notNull().default("Primary"),
  // Default package used when shipping (kg / cm); edited per shipment in the Ship dialog
  packageDefaults: jsonb("package_defaults").$type<{ weight: number; length: number; breadth: number; height: number }>(),
  autoPickup: boolean("auto_pickup").notNull().default(true),
  token: text("token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// WhatsApp sender: either a WhatsApp Web session (QR) or a Meta Cloud API number
export const whatsappAccountsTable = pgTable("whatsapp_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider", { enum: ["web", "meta"] }).notNull(),
  phoneNumber: text("phone_number"),
  // Meta Cloud API
  metaPhoneNumberId: text("meta_phone_number_id"),
  metaWabaId: text("meta_waba_id"),
  metaAccessToken: text("meta_access_token"),
  metaVerifyToken: text("meta_verify_token"),
  metaAppSecret: text("meta_app_secret"),
  status: text("status").notNull().default("disconnected"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Mailbox used to send to and read replies from customers
export const emailAccountsTable = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  fromName: text("from_name"),
  username: text("username").notNull(),
  password: text("password").notNull(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(465),
  smtpSecure: boolean("smtp_secure").notNull().default(true),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port").notNull().default(993),
  imapLastUid: integer("imap_last_uid"),
  status: text("status").notNull().default("unknown"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A Shopify store, linked to the accounts it uses by default
export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shopDomain: text("shop_domain").notNull(),
  publicDomain: text("public_domain"),
  accessToken: text("access_token").notNull(),
  color: text("color").notNull().default("#008060"),
  shiprocketAccountId: integer("shiprocket_account_id").references(() => shiprocketAccountsTable.id, { onDelete: "set null" }),
  whatsappAccountId: integer("whatsapp_account_id").references(() => whatsappAccountsTable.id, { onDelete: "set null" }),
  emailAccountId: integer("email_account_id").references(() => emailAccountsTable.id, { onDelete: "set null" }),
  webhookSecret: text("webhook_secret"),
  // mark orders fulfilled in Shopify (AWB + tracking) once shipped; email the customer
  fulfillInShopify: boolean("fulfill_in_shopify").notNull().default(true),
  notifyOnFulfill: boolean("notify_on_fulfill").notNull().default(true),
  active: boolean("active").notNull().default(true),
  lastOrderSyncAt: timestamp("last_order_sync_at", { withTimezone: true }),
  lastCheckoutSyncAt: timestamp("last_checkout_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Free-form key/value app settings (sheet sync, dashboard password hash, ...)
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShiprocketAccount = typeof shiprocketAccountsTable.$inferSelect;
export type WhatsappAccount = typeof whatsappAccountsTable.$inferSelect;
export type EmailAccount = typeof emailAccountsTable.$inferSelect;
export type Store = typeof storesTable.$inferSelect;
