-- The reference channels of ours (the admin's Live screen) and what `channels` writes of them on a live variant:
-- the reference name that gives the content its identity, our row when there is one, and the country
-- the name's prefix says inside a region.
CREATE TABLE "curation_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"market" text NOT NULL,
	"country" text,
	"theme" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"iptv_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "name_country" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "channel_name" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "channel_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "curation_channels_market_iptv_idx" ON "curation_channels" USING btree ("market","iptv_id");--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_channel_id_curation_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."curation_channels"("id") ON DELETE set null ON UPDATE no action;