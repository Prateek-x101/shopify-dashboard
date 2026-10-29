CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recording_url" text;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");