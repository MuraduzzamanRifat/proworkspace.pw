CREATE TYPE "public"."media_source" AS ENUM('url', 'upload');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"source" "media_source" DEFAULT 'url' NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"mime" text DEFAULT '' NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"restored_from" integer,
	"published_by" uuid,
	"published_by_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "draft_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "draft_sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_published_by_admin_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_url_unique" ON "media" USING btree ("url");--> statement-breakpoint
CREATE INDEX "media_created_idx" ON "media" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_version_unique" ON "page_versions" USING btree ("version");