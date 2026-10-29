ALTER TABLE "shiprocket_accounts" ADD COLUMN "package_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "shiprocket_accounts" ADD COLUMN "auto_pickup" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sr_meta" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "complaint_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "complaint_at" timestamp with time zone;