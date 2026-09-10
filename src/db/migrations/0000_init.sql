CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'admin', 'marketing', 'support');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'payment_pending', 'paid', 'fulfilled', 'payment_failed', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."tracking_status" AS ENUM('pending', 'sent', 'failed', 'abandoned');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" "admin_role" DEFAULT 'support' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"offer_code" text DEFAULT '' NOT NULL,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"recovery_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"published_data" jsonb,
	"draft_data" jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"data" jsonb NOT NULL,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_order_poisha" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"max_redemptions" integer,
	"times_redeemed" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"total_spent_poisha" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"succeeded" boolean DEFAULT true NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"email" text NOT NULL,
	"max_downloads" integer,
	"download_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"list_price_poisha" integer NOT NULL,
	"price_poisha" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_sku" text NOT NULL,
	"product_title" text NOT NULL,
	"offer_code" text NOT NULL,
	"offer_label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_list_price_poisha" integer NOT NULL,
	"unit_price_poisha" integer NOT NULL,
	"discount_poisha" integer DEFAULT 0 NOT NULL,
	"shipping_poisha" integer DEFAULT 0 NOT NULL,
	"tax_poisha" integer DEFAULT 0 NOT NULL,
	"line_total_poisha" integer NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_poisha" integer NOT NULL,
	"discount_poisha" integer DEFAULT 0 NOT NULL,
	"shipping_poisha" integer DEFAULT 0 NOT NULL,
	"tax_poisha" integer DEFAULT 0 NOT NULL,
	"total_poisha" integer NOT NULL,
	"refunded_poisha" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"coupon_code" text,
	"idempotency_key" text,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'uddoktapay' NOT NULL,
	"gateway_invoice_id" text NOT NULL,
	"gateway_payment_url" text DEFAULT '' NOT NULL,
	"gateway_transaction_id" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"sender_number" text DEFAULT '' NOT NULL,
	"amount_poisha" integer NOT NULL,
	"fee_poisha" integer DEFAULT 0 NOT NULL,
	"charged_amount_poisha" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"gateway_status" text DEFAULT '' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"order_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "tracking_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'uddoktapay' NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_section_id_content_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."content_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_published_by_admin_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_grant_id_download_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."download_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_unique" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "checkout_sessions_email_idx" ON "checkout_sessions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "checkout_sessions_completed_idx" ON "checkout_sessions" USING btree ("completed");--> statement-breakpoint
CREATE UNIQUE INDEX "content_sections_key_unique" ON "content_sections" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_section_version_unique" ON "content_versions" USING btree ("section_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_unique" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "download_events_grant_idx" ON "download_events" USING btree ("grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "download_grants_public_id_unique" ON "download_grants" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "download_grants_order_idx" ON "download_grants" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_code_unique" ON "offers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_unique" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_invoice_unique" ON "payments" USING btree ("gateway_invoice_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_events_event_id_unique" ON "tracking_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tracking_events_status_idx" ON "tracking_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_key_unique" ON "webhook_events" USING btree ("event_key");