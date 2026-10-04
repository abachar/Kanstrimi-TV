CREATE TABLE "catalog_epg_source_channels" (
	"source_id" integer NOT NULL,
	"channel_id" text NOT NULL,
	"names" text[] DEFAULT '{}' NOT NULL,
	"programmes" integer DEFAULT 0 NOT NULL,
	"last_end_at" timestamp with time zone,
	CONSTRAINT "catalog_epg_source_channels_source_id_channel_id_pk" PRIMARY KEY("source_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "curation_epg_links" (
	"source_id" integer NOT NULL,
	"content_key" text NOT NULL,
	"channel_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curation_epg_links_source_id_content_key_pk" PRIMARY KEY("source_id","content_key")
);
--> statement-breakpoint
CREATE TABLE "curation_epg_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"offset_minutes" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone,
	"fetch_error" text,
	"channel_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curation_epg_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "catalog_contents" ADD COLUMN "epg_fallback_id" text;--> statement-breakpoint
ALTER TABLE "catalog_epg_source_channels" ADD CONSTRAINT "catalog_epg_source_channels_source_id_curation_epg_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."curation_epg_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation_epg_links" ADD CONSTRAINT "curation_epg_links_source_id_curation_epg_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."curation_epg_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The provider's guide covers about a day and a half: every three days left it empty a day out of three.
UPDATE "settings" SET "value" = '0 3,15 * * *' WHERE "key" = 'epg_cron' AND "value" = '0 3 */3 * *';
