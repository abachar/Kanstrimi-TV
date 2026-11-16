-- A stream of a provider becomes a stable row: `xtream_streams` is the former `catalog_variants` (same ids, the provider's
-- JSON stays where it is), written by difference by the import, and bears what is read in its name. `catalog_variants`
-- is rebuilt beside it with what the catalogue decides about a stream, under the stream's id. The former raw copies
-- (`xtream_streams`, `xtream_categories`, unlogged) go: separator lines come back at the next import.
-- `catalog_categories` becomes `xtream_categories`, keyed by (account, kind, id).

DROP TABLE "xtream_streams";--> statement-breakpoint
DROP TABLE "xtream_categories";--> statement-breakpoint

ALTER TABLE "catalog_categories" RENAME TO "xtream_categories";--> statement-breakpoint
ALTER TABLE "xtream_categories" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "xtream_categories" ADD CONSTRAINT "xtream_categories_account_id_kind_xtream_id_pk" PRIMARY KEY USING INDEX "catalog_categories_kind_xtream_idx";--> statement-breakpoint
ALTER TABLE "xtream_categories" RENAME COLUMN "hidden_manual" TO "hidden";--> statement-breakpoint
ALTER TABLE "xtream_categories" RENAME CONSTRAINT "catalog_categories_account_id_xtream_accounts_id_fk" TO "xtream_categories_account_id_xtream_accounts_id_fk";--> statement-breakpoint

ALTER TABLE "catalog_variants" RENAME TO "xtream_streams";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME CONSTRAINT "catalog_variants_pkey" TO "xtream_streams_pkey";--> statement-breakpoint
ALTER SEQUENCE "catalog_variants_id_seq" RENAME TO "xtream_streams_id_seq";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME CONSTRAINT "catalog_variants_account_id_xtream_accounts_id_fk" TO "xtream_streams_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER INDEX "catalog_variants_kind_xtream_idx" RENAME TO "xtream_streams_account_kind_upstream_idx";--> statement-breakpoint
ALTER INDEX "catalog_variants_kind_cat_idx" RENAME TO "xtream_streams_kind_cat_idx";--> statement-breakpoint

CREATE TABLE "catalog_variants" (
	"id" integer PRIMARY KEY NOT NULL,
	"hidden_manual" boolean DEFAULT false NOT NULL,
	"hidden_by_rule" boolean,
	"tmdb_id" integer,
	"match_status" "match_status" DEFAULT 'pending' NOT NULL,
	"match_score" real,
	"matched_at" timestamp with time zone,
	"match_attempts" integer DEFAULT 0 NOT NULL,
	"ai_kind" text,
	"ai_title" text,
	"ai_original_title" text,
	"ai_year" integer,
	"ai_asked_at" timestamp with time zone,
	"content_key" text,
	"content_id" integer,
	"key_override" text,
	"iptv_adult" boolean DEFAULT false NOT NULL,
	"iptv_theme" text,
	"iptv_id" text,
	"iptv_match" text,
	"epg_mismatch" boolean DEFAULT false NOT NULL,
	"country" text,
	"channel_name" text,
	"channel_id" integer
);--> statement-breakpoint
INSERT INTO "catalog_variants" ("id", "hidden_manual", "hidden_by_rule", "tmdb_id", "match_status", "match_score", "matched_at", "match_attempts",
	"ai_kind", "ai_title", "ai_original_title", "ai_year", "ai_asked_at", "content_key", "content_id", "key_override",
	"iptv_adult", "iptv_theme", "iptv_id", "iptv_match", "epg_mismatch", "country", "channel_name", "channel_id")
SELECT "id", "hidden_manual", "hidden_by_rule", "tmdb_id", "match_status", "match_score", "matched_at", "match_attempts",
	"ai_kind", "ai_title", "ai_original_title", "ai_year", "ai_asked_at", "content_key", "content_id", "key_override",
	"iptv_adult", "iptv_theme", "iptv_id", "iptv_match", "epg_mismatch", "country", "channel_name", "channel_id"
FROM "xtream_streams";--> statement-breakpoint

ALTER TABLE "catalog_variant_profiles" DROP CONSTRAINT "catalog_variant_profiles_variant_id_catalog_variants_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_episode_variants" DROP CONSTRAINT "catalog_episode_variants_item_id_catalog_variants_id_fk";--> statement-breakpoint

-- The generated columns first (they read the ones that leave), then what moved to `catalog_variants`: their indexes and
-- foreign keys go with them.
ALTER TABLE "xtream_streams" DROP COLUMN "adult", DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "xtream_streams" DROP COLUMN "hidden_manual", DROP COLUMN "hidden_by_rule", DROP COLUMN "tmdb_id", DROP COLUMN "match_status",
	DROP COLUMN "match_score", DROP COLUMN "matched_at", DROP COLUMN "match_attempts", DROP COLUMN "ai_kind", DROP COLUMN "ai_title",
	DROP COLUMN "ai_original_title", DROP COLUMN "ai_year", DROP COLUMN "ai_asked_at", DROP COLUMN "content_key", DROP COLUMN "content_id",
	DROP COLUMN "key_override", DROP COLUMN "iptv_adult", DROP COLUMN "iptv_theme", DROP COLUMN "iptv_id", DROP COLUMN "iptv_match",
	DROP COLUMN "epg_mismatch", DROP COLUMN "country", DROP COLUMN "channel_name", DROP COLUMN "channel_id";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME COLUMN "xtream_id" TO "upstream_id";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME COLUMN "clean_title" TO "title";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME COLUMN "name_adult" TO "adult";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME COLUMN "name_theme" TO "theme";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME COLUMN "name_country" TO "country";--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD COLUMN "separator" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_id_xtream_streams_id_fk" FOREIGN KEY ("id") REFERENCES "public"."xtream_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_content_id_catalog_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."catalog_contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_channel_id_curation_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."curation_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_profiles" ADD CONSTRAINT "catalog_variant_profiles_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_episode_variants" ADD CONSTRAINT "catalog_episode_variants_item_id_catalog_variants_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_variants_match_idx" ON "catalog_variants" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "catalog_variants_content_idx" ON "catalog_variants" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_content_key_idx" ON "catalog_variants" USING btree ("content_key");--> statement-breakpoint
ANALYZE "catalog_variants";--> statement-breakpoint
ANALYZE "xtream_streams";
