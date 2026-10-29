ALTER TABLE "stores" ADD COLUMN "fulfill_in_shopify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "notify_on_fulfill" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shopify_fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shopify_fulfill_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp with time zone;