-- The contents split in two: `catalog_titles` (movies and series: the former `catalog_contents`, same ids) and
-- `catalog_channels` (the live rows, moved with their ids; new ones draw from the titles' sequence, so a content id still
-- names one row). A variant names its title or its channel (`title_id`, `channel_id`) instead of one `content_id`; its
-- link to a reference channel of ours becomes `reference_id`. What each profile sees follows: `app_profile_titles`,
-- `app_profile_channels`.

ALTER TABLE "catalog_contents" RENAME TO "catalog_titles";--> statement-breakpoint
ALTER SEQUENCE "catalog_contents_id_seq" RENAME TO "catalog_titles_id_seq";--> statement-breakpoint
ALTER TABLE "catalog_titles" RENAME CONSTRAINT "catalog_contents_pkey" TO "catalog_titles_pkey";--> statement-breakpoint
ALTER TABLE "catalog_titles" RENAME CONSTRAINT "catalog_contents_key_unique" TO "catalog_titles_key_unique";--> statement-breakpoint
ALTER INDEX "catalog_contents_list_idx" RENAME TO "catalog_titles_list_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_release_idx" RENAME TO "catalog_titles_release_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_saga_idx" RENAME TO "catalog_titles_saga_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_tmdb_idx" RENAME TO "catalog_titles_tmdb_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_companies_idx" RENAME TO "catalog_titles_companies_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_networks_idx" RENAME TO "catalog_titles_networks_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_title_idx" RENAME TO "catalog_titles_title_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_rating_idx" RENAME TO "catalog_titles_rating_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_year_idx" RENAME TO "catalog_titles_year_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_genres_idx" RENAME TO "catalog_titles_genres_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_search_idx" RENAME TO "catalog_titles_search_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_cast_idx" RENAME TO "catalog_titles_cast_idx";--> statement-breakpoint
ALTER INDEX "catalog_contents_titles_trgm_idx" RENAME TO "catalog_titles_titles_trgm_idx";--> statement-breakpoint

CREATE TABLE "catalog_channels" (
	"id" integer PRIMARY KEY DEFAULT nextval('catalog_titles_id_seq') NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"market" text,
	"country" text,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"logo_url" text,
	"iptv_id" text,
	"number" integer,
	"epg_id" text,
	"epg_fallback_id" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"max_quality_rank" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"adult" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"search" "tsvector",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_channels_key_unique" UNIQUE("key")
);--> statement-breakpoint
INSERT INTO "catalog_channels" ("id", "key", "name", "market", "country", "themes", "logo_url", "iptv_id", "number", "epg_id", "epg_fallback_id",
	"source_count", "max_quality_rank", "languages", "visible", "adult", "added_at", "search", "updated_at")
SELECT "id", "key", "title", "market", "country", "themes", "logo_url", "iptv_id", "channel_number", "epg_channel_id", "epg_fallback_id",
	"variant_count", "max_quality_rank", "languages", "visible", "adult", "added_at", "search", "updated_at"
FROM "catalog_titles" WHERE "kind" = 'live';--> statement-breakpoint

ALTER TABLE "catalog_variants" RENAME COLUMN "channel_id" TO "reference_id";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME CONSTRAINT "catalog_variants_channel_id_curation_channels_id_fk" TO "catalog_variants_reference_id_curation_channels_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "title_id" integer;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "channel_id" integer;--> statement-breakpoint
UPDATE "catalog_variants" v SET
	"title_id" = CASE WHEN t."kind" <> 'live' THEN v."content_id" END,
	"channel_id" = CASE WHEN t."kind" = 'live' THEN v."content_id" END
FROM "catalog_titles" t WHERE t."id" = v."content_id";--> statement-breakpoint
ALTER TABLE "catalog_variants" DROP COLUMN "content_id";--> statement-breakpoint

CREATE TABLE "app_profile_titles" (
	"title_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	CONSTRAINT "app_profile_titles_title_id_profile_id_pk" PRIMARY KEY("title_id","profile_id")
);--> statement-breakpoint
CREATE TABLE "app_profile_channels" (
	"channel_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	CONSTRAINT "app_profile_channels_channel_id_profile_id_pk" PRIMARY KEY("channel_id","profile_id")
);--> statement-breakpoint
INSERT INTO "app_profile_titles" ("title_id", "profile_id")
SELECT p."content_id", p."profile_id" FROM "catalog_content_profiles" p JOIN "catalog_titles" t ON t."id" = p."content_id" WHERE t."kind" <> 'live';--> statement-breakpoint
INSERT INTO "app_profile_channels" ("channel_id", "profile_id")
SELECT p."content_id", p."profile_id" FROM "catalog_content_profiles" p JOIN "catalog_channels" c ON c."id" = p."content_id";--> statement-breakpoint
DROP TABLE "catalog_content_profiles";--> statement-breakpoint

ALTER TABLE "catalog_episodes" RENAME COLUMN "content_id" TO "title_id";--> statement-breakpoint
ALTER TABLE "catalog_episodes" RENAME CONSTRAINT "catalog_episodes_content_id_catalog_contents_id_fk" TO "catalog_episodes_title_id_catalog_titles_id_fk";--> statement-breakpoint
ALTER INDEX "catalog_episodes_content_season_number_idx" RENAME TO "catalog_episodes_title_season_number_idx";--> statement-breakpoint

-- The channels have moved: a title is a movie or a series, and loses what only a channel has.
DELETE FROM "catalog_titles" WHERE "kind" = 'live';--> statement-breakpoint
ALTER TABLE "catalog_titles" DROP COLUMN "market", DROP COLUMN "country", DROP COLUMN "logo_url", DROP COLUMN "iptv_id", DROP COLUMN "category_xtream_id",
	DROP COLUMN "channel_number", DROP COLUMN "epg_channel_id", DROP COLUMN "epg_fallback_id", DROP COLUMN "themes";--> statement-breakpoint
ALTER TABLE "catalog_titles" RENAME COLUMN "variant_count" TO "source_count";--> statement-breakpoint

ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_title_id_catalog_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."catalog_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_channel_id_catalog_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."catalog_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_one_content" CHECK (num_nonnulls("catalog_variants"."title_id", "catalog_variants"."channel_id") <= 1);--> statement-breakpoint
ALTER TABLE "app_profile_titles" ADD CONSTRAINT "app_profile_titles_title_id_catalog_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."catalog_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profile_titles" ADD CONSTRAINT "app_profile_titles_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profile_channels" ADD CONSTRAINT "app_profile_channels_channel_id_catalog_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."catalog_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profile_channels" ADD CONSTRAINT "app_profile_channels_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_variants_content_idx" ON "catalog_variants" USING btree (coalesce("title_id", "channel_id"));--> statement-breakpoint
CREATE INDEX "catalog_variants_title_idx" ON "catalog_variants" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_channel_idx" ON "catalog_variants" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "catalog_channels_list_idx" ON "catalog_channels" USING btree ("visible","number","name","id");--> statement-breakpoint
CREATE INDEX "catalog_channels_search_idx" ON "catalog_channels" USING gin ("search");--> statement-breakpoint
CREATE INDEX "catalog_channels_names_trgm_idx" ON "catalog_channels" USING gin (search_titles("name", null, null) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "app_profile_titles_profile_idx" ON "app_profile_titles" USING btree ("profile_id","title_id");--> statement-breakpoint
CREATE INDEX "app_profile_channels_profile_idx" ON "app_profile_channels" USING btree ("profile_id","channel_id");--> statement-breakpoint
ANALYZE "catalog_titles";--> statement-breakpoint
ANALYZE "catalog_channels";--> statement-breakpoint
ANALYZE "catalog_variants";--> statement-breakpoint
ANALYZE "app_profile_titles";--> statement-breakpoint
ANALYZE "app_profile_channels";
