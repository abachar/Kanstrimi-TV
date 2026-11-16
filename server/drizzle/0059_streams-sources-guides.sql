-- Three tables take the name of what they hold, and name a stream by `xtream_id` (`xtream_streams.id`):
-- `app_profile_streams` (the streams a profile's filter keeps, ex `catalog_variant_profiles`), `catalog_episode_sources`
-- (an episode's stream under a series' stream, ex `catalog_episode_variants`: the provider's own id becomes `upstream_id`),
-- and `catalog_channel_guides` (the guide linked by hand to a channel, ex `curation_epg_links`, by the channel's id).

ALTER TABLE "catalog_variant_profiles" RENAME TO "app_profile_streams";--> statement-breakpoint
ALTER TABLE "app_profile_streams" RENAME COLUMN "variant_id" TO "xtream_id";--> statement-breakpoint
ALTER TABLE "app_profile_streams" DROP CONSTRAINT "catalog_variant_profiles_variant_id_catalog_variants_id_fk";--> statement-breakpoint
ALTER TABLE "app_profile_streams" ADD CONSTRAINT "app_profile_streams_xtream_id_xtream_streams_id_fk" FOREIGN KEY ("xtream_id") REFERENCES "public"."xtream_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profile_streams" RENAME CONSTRAINT "catalog_variant_profiles_profile_id_app_profiles_id_fk" TO "app_profile_streams_profile_id_app_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "app_profile_streams" RENAME CONSTRAINT "catalog_variant_profiles_variant_id_profile_id_pk" TO "app_profile_streams_xtream_id_profile_id_pk";--> statement-breakpoint
ALTER INDEX "catalog_variant_profiles_profile_idx" RENAME TO "app_profile_streams_profile_idx";--> statement-breakpoint

ALTER TABLE "catalog_episode_variants" RENAME TO "catalog_episode_sources";--> statement-breakpoint
ALTER SEQUENCE "catalog_episode_variants_id_seq" RENAME TO "catalog_episode_sources_id_seq";--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" RENAME CONSTRAINT "catalog_episode_variants_pkey" TO "catalog_episode_sources_pkey";--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" RENAME COLUMN "xtream_id" TO "upstream_id";--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" RENAME COLUMN "item_id" TO "xtream_id";--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" DROP CONSTRAINT "catalog_episode_variants_item_id_catalog_variants_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" ADD CONSTRAINT "catalog_episode_sources_xtream_id_xtream_streams_id_fk" FOREIGN KEY ("xtream_id") REFERENCES "public"."xtream_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_episode_sources" RENAME CONSTRAINT "catalog_episode_variants_episode_id_catalog_episodes_id_fk" TO "catalog_episode_sources_episode_id_catalog_episodes_id_fk";--> statement-breakpoint
ALTER INDEX "catalog_episode_variants_episode_item_idx" RENAME TO "catalog_episode_sources_episode_stream_idx";--> statement-breakpoint
ALTER INDEX "catalog_episode_variants_item_idx" RENAME TO "catalog_episode_sources_stream_idx";--> statement-breakpoint

CREATE TABLE "catalog_channel_guides" (
	"channel_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"guide_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_channel_guides_channel_id_source_id_pk" PRIMARY KEY("channel_id","source_id")
);--> statement-breakpoint
-- A link whose channel is not in the catalogue at this moment has nothing to hold on to: it is not carried over.
INSERT INTO "catalog_channel_guides" ("channel_id", "source_id", "guide_id", "updated_at")
SELECT c."id", l."source_id", l."channel_id", l."updated_at" FROM "curation_epg_links" l JOIN "catalog_channels" c ON c."key" = l."content_key";--> statement-breakpoint
DROP TABLE "curation_epg_links";--> statement-breakpoint
ALTER TABLE "catalog_channel_guides" ADD CONSTRAINT "catalog_channel_guides_channel_id_catalog_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."catalog_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_channel_guides" ADD CONSTRAINT "catalog_channel_guides_source_id_settings_epg_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."settings_epg_sources"("id") ON DELETE cascade ON UPDATE no action;
