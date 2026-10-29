CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"from_name" text,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer DEFAULT 465 NOT NULL,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"imap_host" text,
	"imap_port" integer DEFAULT 993 NOT NULL,
	"imap_last_uid" integer,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shiprocket_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"pickup_location" text DEFAULT 'Primary' NOT NULL,
	"token" text,
	"token_expires_at" timestamp with time zone,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shop_domain" text NOT NULL,
	"public_domain" text,
	"access_token" text NOT NULL,
	"color" text DEFAULT '#008060' NOT NULL,
	"shiprocket_account_id" integer,
	"whatsapp_account_id" integer,
	"email_account_id" integer,
	"webhook_secret" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_order_sync_at" timestamp with time zone,
	"last_checkout_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"phone_number" text,
	"meta_phone_number_id" text,
	"meta_waba_id" text,
	"meta_access_token" text,
	"meta_verify_token" text,
	"meta_app_secret" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"store_id" integer,
	"trigger" text NOT NULL,
	"trigger_value" text DEFAULT '' NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"subject" text,
	"template_name" text,
	"template_language" text DEFAULT 'en',
	"template_params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_image" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"customer_name" text,
	"email" text,
	"phone" text,
	"shipping_address" jsonb,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"checkout_url" text,
	"stage" text,
	"status" text DEFAULT 'abandoned' NOT NULL,
	"recovered_order_id" integer,
	"last_sent_at" timestamp with time zone,
	"sent_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer,
	"channel" text NOT NULL,
	"account_id" integer,
	"direction" text NOT NULL,
	"contact" text NOT NULL,
	"contact_name" text,
	"order_id" integer,
	"checkout_id" integer,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"media_url" text,
	"template_name" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"external_id" text,
	"thread_id" text,
	"source" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"shopify_id" text NOT NULL,
	"name" text NOT NULL,
	"order_number" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"financial_status" text,
	"fulfillment_status" text,
	"payment_method" text DEFAULT 'Prepaid' NOT NULL,
	"total_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"note" text,
	"customer_name" text,
	"email" text,
	"phone" text,
	"shipping_address" jsonb,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"address_issue" text,
	"sr_account_id" integer,
	"sr_order_id" text,
	"sr_shipment_id" text,
	"sr_status" text,
	"sr_status_code" text,
	"awb" text,
	"courier" text,
	"label_url" text,
	"sr_updated_at" timestamp with time zone,
	"last_wa_status" text,
	"last_wa_at" timestamp with time zone,
	"last_email_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_shiprocket_account_id_shiprocket_accounts_id_fk" FOREIGN KEY ("shiprocket_account_id") REFERENCES "public"."shiprocket_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_log_uq" ON "automation_log" USING btree ("rule_id","entity_type","entity_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_store_source_ext_uq" ON "checkouts" USING btree ("store_id","source","external_id");--> statement-breakpoint
CREATE INDEX "checkouts_created_idx" ON "checkouts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "checkouts_phone_idx" ON "checkouts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "messages_contact_idx" ON "messages" USING btree ("contact","created_at");--> statement-breakpoint
CREATE INDEX "messages_order_idx" ON "messages" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "messages_checkout_idx" ON "messages" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "messages_external_idx" ON "messages" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_shopify_uq" ON "orders" USING btree ("store_id","shopify_id");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "orders_awb_idx" ON "orders" USING btree ("awb");