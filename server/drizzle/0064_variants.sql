-- A title holds variants, one per provider's stream: no more versions grouping sources. What a profile chose for a
-- title names the stream itself (`stream_id`; a series': the stream its episodes sit under), no longer a made-up
-- version id (« vf-4k-dv »): the choices already kept stay by what they were (language, quality, dynamic range, cut).
ALTER TABLE "app_profile_versions" RENAME TO "app_profile_variants";--> statement-breakpoint
ALTER TABLE "app_profile_variants" RENAME CONSTRAINT "app_profile_versions_profile_id_content_key_pk" TO "app_profile_variants_profile_id_content_key_pk";--> statement-breakpoint
ALTER TABLE "app_profile_variants" RENAME CONSTRAINT "app_profile_versions_profile_id_app_profiles_id_fk" TO "app_profile_variants_profile_id_app_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "app_profile_variants" DROP COLUMN "version_id";--> statement-breakpoint
ALTER TABLE "app_profile_variants" ADD COLUMN "stream_id" integer;--> statement-breakpoint
ALTER TABLE "app_profile_variants" ADD CONSTRAINT "app_profile_variants_stream_id_xtream_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."xtream_streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profiles" RENAME COLUMN "remember_versions" TO "remember_variants";--> statement-breakpoint
ALTER TABLE "app_profiles" RENAME COLUMN "switch_source_on_failure" TO "switch_variant_on_failure";
