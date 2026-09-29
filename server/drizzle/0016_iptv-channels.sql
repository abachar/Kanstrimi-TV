CREATE TABLE "iptv_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"alt_names" text[] DEFAULT '{}' NOT NULL,
	"network" text,
	"owners" text[] DEFAULT '{}' NOT NULL,
	"country" text NOT NULL,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"launched" text,
	"closed" text,
	"replaced_by" text,
	"website" text,
	"logo_url" text,
	"logo_path" text
);
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "iptv_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "iptv_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "iptv_match" text;--> statement-breakpoint
CREATE INDEX "iptv_channels_country_idx" ON "iptv_channels" USING btree ("country");