-- Tables named after their scope: xtream_ = what the providers send, catalog_ = our titles, channels and editorial
-- choices, cache_ = copies of outside sources (all rebuildable), app_ = the household and what it records, settings_ = the
-- server's settings, task_ = the run journal. Renames only: no column changes. Constraints, sequences and indexes follow,
-- so every name in the database still starts with its table's.

ALTER TABLE "provider_accounts" RENAME TO "xtream_accounts";--> statement-breakpoint
ALTER TABLE "curation_studios" RENAME TO "catalog_studios";--> statement-breakpoint
ALTER TABLE "tmdb_cache" RENAME TO "cache_tmdb";--> statement-breakpoint
ALTER TABLE "tmdb_extras" RENAME TO "cache_tmdb_extras";--> statement-breakpoint
ALTER TABLE "tmdb_recommendations" RENAME TO "cache_tmdb_recommendations";--> statement-breakpoint
ALTER TABLE "tmdb_trending" RENAME TO "cache_tmdb_trending";--> statement-breakpoint
ALTER TABLE "iptvorg_channels" RENAME TO "cache_iptvorg_channels";--> statement-breakpoint
ALTER TABLE "skipdb_segments" RENAME TO "cache_skipdb_segments";--> statement-breakpoint
ALTER TABLE "theintrodb_cache" RENAME TO "cache_theintrodb";--> statement-breakpoint
ALTER TABLE "introdb_cache" RENAME TO "cache_introdb";--> statement-breakpoint
ALTER TABLE "xtream_info_cache" RENAME TO "cache_xtream_info";--> statement-breakpoint
ALTER TABLE "catalog_epg_programmes" RENAME TO "cache_epg_programmes";--> statement-breakpoint
ALTER TABLE "catalog_epg_source_channels" RENAME TO "cache_epg_source_channels";--> statement-breakpoint
ALTER TABLE "curation_epg_sources" RENAME TO "settings_epg_sources";--> statement-breakpoint
ALTER TABLE "curation_epg_offsets" RENAME TO "settings_epg_offsets";--> statement-breakpoint
ALTER TABLE "curation_waitlist" RENAME TO "app_waitlist";--> statement-breakpoint
ALTER TABLE "device_push" RENAME TO "app_device_push";--> statement-breakpoint
ALTER TABLE "notifications" RENAME TO "app_notifications";--> statement-breakpoint
ALTER TABLE "cache_epg_programmes" RENAME CONSTRAINT "catalog_epg_programmes_pkey" TO "cache_epg_programmes_pkey";--> statement-breakpoint
ALTER TABLE "settings_epg_offsets" RENAME CONSTRAINT "curation_epg_offsets_pkey" TO "settings_epg_offsets_pkey";--> statement-breakpoint
ALTER TABLE "settings_epg_sources" RENAME CONSTRAINT "curation_epg_sources_pkey" TO "settings_epg_sources_pkey";--> statement-breakpoint
ALTER TABLE "catalog_studios" RENAME CONSTRAINT "curation_studios_pkey" TO "catalog_studios_pkey";--> statement-breakpoint
ALTER TABLE "app_device_push" RENAME CONSTRAINT "device_push_pkey" TO "app_device_push_pkey";--> statement-breakpoint
ALTER TABLE "cache_iptvorg_channels" RENAME CONSTRAINT "iptvorg_channels_pkey" TO "cache_iptvorg_channels_pkey";--> statement-breakpoint
ALTER TABLE "app_notifications" RENAME CONSTRAINT "notifications_pkey" TO "app_notifications_pkey";--> statement-breakpoint
ALTER TABLE "xtream_accounts" RENAME CONSTRAINT "provider_accounts_pkey" TO "xtream_accounts_pkey";--> statement-breakpoint
ALTER TABLE "cache_skipdb_segments" RENAME CONSTRAINT "skipdb_segments_pkey" TO "cache_skipdb_segments_pkey";--> statement-breakpoint
ALTER TABLE "cache_tmdb" RENAME CONSTRAINT "tmdb_cache_pkey" TO "cache_tmdb_pkey";--> statement-breakpoint
ALTER TABLE "cache_xtream_info" RENAME CONSTRAINT "xtream_info_cache_pkey" TO "cache_xtream_info_pkey";--> statement-breakpoint
ALTER TABLE "catalog_categories" RENAME CONSTRAINT "catalog_categories_account_id_provider_accounts_id_fk" TO "catalog_categories_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "cache_epg_source_channels" RENAME CONSTRAINT "catalog_epg_source_channels_source_id_channel_id_pk" TO "cache_epg_source_channels_source_id_channel_id_pk";--> statement-breakpoint
ALTER TABLE "cache_epg_source_channels" RENAME CONSTRAINT "catalog_epg_source_channels_source_id_curation_epg_sources_id_f" TO "cache_epg_source_channels_source_id_settings_epg_sources_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME CONSTRAINT "catalog_variants_account_id_provider_accounts_id_fk" TO "catalog_variants_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "curation_epg_links" RENAME CONSTRAINT "curation_epg_links_source_id_curation_epg_sources_id_fk" TO "curation_epg_links_source_id_settings_epg_sources_id_fk";--> statement-breakpoint
ALTER TABLE "settings_epg_sources" RENAME CONSTRAINT "curation_epg_sources_url_unique" TO "settings_epg_sources_url_unique";--> statement-breakpoint
ALTER TABLE "app_waitlist" RENAME CONSTRAINT "curation_waitlist_profile_id_content_key_pk" TO "app_waitlist_profile_id_content_key_pk";--> statement-breakpoint
ALTER TABLE "app_waitlist" RENAME CONSTRAINT "curation_waitlist_profile_id_app_profiles_id_fk" TO "app_waitlist_profile_id_app_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "app_device_push" RENAME CONSTRAINT "device_push_device_id_app_devices_id_fk" TO "app_device_push_device_id_app_devices_id_fk";--> statement-breakpoint
ALTER TABLE "cache_introdb" RENAME CONSTRAINT "introdb_cache_imdb_id_season_episode_pk" TO "cache_introdb_imdb_id_season_episode_pk";--> statement-breakpoint
ALTER TABLE "app_notifications" RENAME CONSTRAINT "notifications_device_id_app_devices_id_fk" TO "app_notifications_device_id_app_devices_id_fk";--> statement-breakpoint
ALTER TABLE "cache_theintrodb" RENAME CONSTRAINT "theintrodb_cache_media_type_tmdb_id_season_episode_duration_pk" TO "cache_theintrodb_media_type_tmdb_id_season_episode_duration_pk";--> statement-breakpoint
ALTER TABLE "cache_tmdb_extras" RENAME CONSTRAINT "tmdb_extras_media_type_tmdb_id_pk" TO "cache_tmdb_extras_media_type_tmdb_id_pk";--> statement-breakpoint
ALTER TABLE "cache_tmdb_recommendations" RENAME CONSTRAINT "tmdb_recommendations_media_type_tmdb_id_pk" TO "cache_tmdb_recommendations_media_type_tmdb_id_pk";--> statement-breakpoint
ALTER TABLE "cache_tmdb_trending" RENAME CONSTRAINT "tmdb_trending_media_type_rank_pk" TO "cache_tmdb_trending_media_type_rank_pk";--> statement-breakpoint
ALTER TABLE "xtream_categories" RENAME CONSTRAINT "xtream_categories_account_id_provider_accounts_id_fk" TO "xtream_categories_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "cache_xtream_info" RENAME CONSTRAINT "xtream_info_cache_account_id_provider_accounts_id_fk" TO "cache_xtream_info_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "xtream_streams" RENAME CONSTRAINT "xtream_streams_account_id_provider_accounts_id_fk" TO "xtream_streams_account_id_xtream_accounts_id_fk";--> statement-breakpoint
ALTER SEQUENCE "catalog_epg_programmes_id_seq" RENAME TO "cache_epg_programmes_id_seq";--> statement-breakpoint
ALTER SEQUENCE "curation_epg_sources_id_seq" RENAME TO "settings_epg_sources_id_seq";--> statement-breakpoint
ALTER SEQUENCE "curation_studios_id_seq" RENAME TO "catalog_studios_id_seq";--> statement-breakpoint
ALTER SEQUENCE "notifications_id_seq" RENAME TO "app_notifications_id_seq";--> statement-breakpoint
ALTER SEQUENCE "provider_accounts_id_seq" RENAME TO "xtream_accounts_id_seq";--> statement-breakpoint
ALTER SEQUENCE "tmdb_cache_id_seq" RENAME TO "cache_tmdb_id_seq";--> statement-breakpoint
ALTER SEQUENCE "xtream_info_cache_id_seq" RENAME TO "cache_xtream_info_id_seq";--> statement-breakpoint
ALTER INDEX "catalog_epg_programmes_channel_start_idx" RENAME TO "cache_epg_programmes_channel_start_idx";--> statement-breakpoint
ALTER INDEX "catalog_epg_programmes_end_idx" RENAME TO "cache_epg_programmes_end_idx";--> statement-breakpoint
ALTER INDEX "curation_studios_kind_tmdb_idx" RENAME TO "catalog_studios_kind_tmdb_idx";--> statement-breakpoint
ALTER INDEX "iptvorg_channels_country_idx" RENAME TO "cache_iptvorg_channels_country_idx";--> statement-breakpoint
ALTER INDEX "notifications_sent_idx" RENAME TO "app_notifications_sent_idx";--> statement-breakpoint
ALTER INDEX "skipdb_segments_title_idx" RENAME TO "cache_skipdb_segments_title_idx";--> statement-breakpoint
ALTER INDEX "tmdb_cache_idx" RENAME TO "cache_tmdb_idx";--> statement-breakpoint
ALTER INDEX "tmdb_cache_logoless_idx" RENAME TO "cache_tmdb_logoless_idx";--> statement-breakpoint
ALTER INDEX "xtream_info_cache_idx" RENAME TO "cache_xtream_info_idx";
