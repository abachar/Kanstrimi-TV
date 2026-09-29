-- Tables named after who writes them: xtream_ / tmdb_ / iptvorg_ = a copy of that source, catalog_ = built by the pipeline,
-- curation_ = the admin's choices, app_ = what the app records, task_ = the run journal. Indexes, constraints and
-- sequences follow, so every name in the database starts with its table's.

ALTER TABLE "items" RENAME TO "catalog_variants";--> statement-breakpoint
ALTER TABLE "contents" RENAME TO "catalog_contents";--> statement-breakpoint
ALTER TABLE "categories" RENAME TO "catalog_categories";--> statement-breakpoint
ALTER TABLE "episodes" RENAME TO "catalog_episodes";--> statement-breakpoint
ALTER TABLE "episode_sources" RENAME TO "catalog_episode_variants";--> statement-breakpoint
ALTER TABLE "epg_programmes" RENAME TO "catalog_epg_programmes";--> statement-breakpoint
ALTER TABLE "info_cache" RENAME TO "xtream_info_cache";--> statement-breakpoint
ALTER TABLE "iptv_channels" RENAME TO "iptvorg_channels";--> statement-breakpoint
ALTER TABLE "trending" RENAME TO "tmdb_trending";--> statement-breakpoint
ALTER TABLE "filter_rules" RENAME TO "curation_filter_rules";--> statement-breakpoint
ALTER TABLE "epg_offsets" RENAME TO "curation_epg_offsets";--> statement-breakpoint
ALTER TABLE "studios" RENAME TO "curation_studios";--> statement-breakpoint
ALTER TABLE "favorites" RENAME TO "app_favorites";--> statement-breakpoint
ALTER TABLE "watch_progress" RENAME TO "app_watch_progress";--> statement-breakpoint
ALTER TABLE "devices" RENAME TO "app_devices";--> statement-breakpoint
ALTER TABLE "sync_runs" RENAME TO "task_runs";--> statement-breakpoint
ALTER TABLE "sync_logs" RENAME TO "task_steps";--> statement-breakpoint
ALTER TABLE "task_steps" RENAME COLUMN "job" TO "step";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME CONSTRAINT "items_pkey" TO "catalog_variants_pkey";--> statement-breakpoint
ALTER SEQUENCE "items_id_seq" RENAME TO "catalog_variants_id_seq";--> statement-breakpoint
ALTER INDEX "items_kind_xtream_idx" RENAME TO "catalog_variants_kind_xtream_idx";--> statement-breakpoint
ALTER INDEX "items_kind_cat_idx" RENAME TO "catalog_variants_kind_cat_idx";--> statement-breakpoint
ALTER INDEX "items_match_idx" RENAME TO "catalog_variants_match_idx";--> statement-breakpoint
ALTER INDEX "items_content_idx" RENAME TO "catalog_variants_content_idx";--> statement-breakpoint
ALTER INDEX "items_content_key_idx" RENAME TO "catalog_variants_content_key_idx";--> statement-breakpoint
ALTER TABLE "catalog_contents" RENAME CONSTRAINT "contents_pkey" TO "catalog_contents_pkey";--> statement-breakpoint
ALTER SEQUENCE "contents_id_seq" RENAME TO "catalog_contents_id_seq";--> statement-breakpoint
ALTER INDEX "contents_list_idx" RENAME TO "catalog_contents_list_idx";--> statement-breakpoint
ALTER INDEX "contents_release_idx" RENAME TO "catalog_contents_release_idx";--> statement-breakpoint
ALTER INDEX "contents_saga_idx" RENAME TO "catalog_contents_saga_idx";--> statement-breakpoint
ALTER INDEX "contents_companies_idx" RENAME TO "catalog_contents_companies_idx";--> statement-breakpoint
ALTER INDEX "contents_networks_idx" RENAME TO "catalog_contents_networks_idx";--> statement-breakpoint
ALTER INDEX "contents_title_idx" RENAME TO "catalog_contents_title_idx";--> statement-breakpoint
ALTER INDEX "contents_rating_idx" RENAME TO "catalog_contents_rating_idx";--> statement-breakpoint
ALTER INDEX "contents_year_idx" RENAME TO "catalog_contents_year_idx";--> statement-breakpoint
ALTER INDEX "contents_genres_idx" RENAME TO "catalog_contents_genres_idx";--> statement-breakpoint
ALTER INDEX "contents_search_idx" RENAME TO "catalog_contents_search_idx";--> statement-breakpoint
ALTER TABLE "catalog_categories" RENAME CONSTRAINT "categories_pkey" TO "catalog_categories_pkey";--> statement-breakpoint
ALTER SEQUENCE "categories_id_seq" RENAME TO "catalog_categories_id_seq";--> statement-breakpoint
ALTER INDEX "categories_kind_xtream_idx" RENAME TO "catalog_categories_kind_xtream_idx";--> statement-breakpoint
ALTER TABLE "catalog_episodes" RENAME CONSTRAINT "episodes_pkey" TO "catalog_episodes_pkey";--> statement-breakpoint
ALTER SEQUENCE "episodes_id_seq" RENAME TO "catalog_episodes_id_seq";--> statement-breakpoint
ALTER INDEX "episodes_content_season_number_idx" RENAME TO "catalog_episodes_content_season_number_idx";--> statement-breakpoint
ALTER TABLE "catalog_episode_variants" RENAME CONSTRAINT "episode_sources_pkey" TO "catalog_episode_variants_pkey";--> statement-breakpoint
ALTER SEQUENCE "episode_sources_id_seq" RENAME TO "catalog_episode_variants_id_seq";--> statement-breakpoint
ALTER INDEX "episode_sources_episode_item_idx" RENAME TO "catalog_episode_variants_episode_item_idx";--> statement-breakpoint
ALTER INDEX "episode_sources_item_idx" RENAME TO "catalog_episode_variants_item_idx";--> statement-breakpoint
ALTER TABLE "catalog_epg_programmes" RENAME CONSTRAINT "epg_programmes_pkey" TO "catalog_epg_programmes_pkey";--> statement-breakpoint
ALTER SEQUENCE "epg_programmes_id_seq" RENAME TO "catalog_epg_programmes_id_seq";--> statement-breakpoint
ALTER INDEX "epg_programmes_channel_start_idx" RENAME TO "catalog_epg_programmes_channel_start_idx";--> statement-breakpoint
ALTER INDEX "epg_programmes_end_idx" RENAME TO "catalog_epg_programmes_end_idx";--> statement-breakpoint
ALTER TABLE "xtream_info_cache" RENAME CONSTRAINT "info_cache_pkey" TO "xtream_info_cache_pkey";--> statement-breakpoint
ALTER SEQUENCE "info_cache_id_seq" RENAME TO "xtream_info_cache_id_seq";--> statement-breakpoint
ALTER TABLE "iptvorg_channels" RENAME CONSTRAINT "iptv_channels_pkey" TO "iptvorg_channels_pkey";--> statement-breakpoint
ALTER INDEX "iptv_channels_country_idx" RENAME TO "iptvorg_channels_country_idx";--> statement-breakpoint
ALTER TABLE "curation_filter_rules" RENAME CONSTRAINT "filter_rules_pkey" TO "curation_filter_rules_pkey";--> statement-breakpoint
ALTER SEQUENCE "filter_rules_id_seq" RENAME TO "curation_filter_rules_id_seq";--> statement-breakpoint
ALTER TABLE "curation_epg_offsets" RENAME CONSTRAINT "epg_offsets_pkey" TO "curation_epg_offsets_pkey";--> statement-breakpoint
ALTER TABLE "curation_studios" RENAME CONSTRAINT "studios_pkey" TO "curation_studios_pkey";--> statement-breakpoint
ALTER SEQUENCE "studios_id_seq" RENAME TO "curation_studios_id_seq";--> statement-breakpoint
ALTER INDEX "studios_kind_tmdb_idx" RENAME TO "curation_studios_kind_tmdb_idx";--> statement-breakpoint
ALTER TABLE "app_favorites" RENAME CONSTRAINT "favorites_pkey" TO "app_favorites_pkey";--> statement-breakpoint
ALTER TABLE "app_watch_progress" RENAME CONSTRAINT "watch_progress_pkey" TO "app_watch_progress_pkey";--> statement-breakpoint
ALTER TABLE "app_devices" RENAME CONSTRAINT "devices_pkey" TO "app_devices_pkey";--> statement-breakpoint
ALTER SEQUENCE "devices_id_seq" RENAME TO "app_devices_id_seq";--> statement-breakpoint
ALTER TABLE "task_runs" RENAME CONSTRAINT "sync_runs_pkey" TO "task_runs_pkey";--> statement-breakpoint
ALTER SEQUENCE "sync_runs_id_seq" RENAME TO "task_runs_id_seq";--> statement-breakpoint
ALTER INDEX "sync_runs_task_started_idx" RENAME TO "task_runs_task_started_idx";--> statement-breakpoint
ALTER TABLE "task_steps" RENAME CONSTRAINT "sync_logs_pkey" TO "task_steps_pkey";--> statement-breakpoint
ALTER SEQUENCE "sync_logs_id_seq" RENAME TO "task_steps_id_seq";--> statement-breakpoint
ALTER INDEX "info_cache_idx" RENAME TO "xtream_info_cache_idx";--> statement-breakpoint
ALTER TABLE "tmdb_trending" RENAME CONSTRAINT "trending_media_type_rank_pk" TO "tmdb_trending_media_type_rank_pk";--> statement-breakpoint
ALTER TABLE "catalog_contents" RENAME CONSTRAINT "contents_key_unique" TO "catalog_contents_key_unique";--> statement-breakpoint
ALTER TABLE "app_devices" RENAME CONSTRAINT "devices_code_unique" TO "app_devices_code_unique";--> statement-breakpoint
ALTER TABLE "app_devices" RENAME CONSTRAINT "devices_token_hash_unique" TO "app_devices_token_hash_unique";--> statement-breakpoint
ALTER TABLE "catalog_episodes" RENAME CONSTRAINT "episodes_key_unique" TO "catalog_episodes_key_unique";--> statement-breakpoint
ALTER TABLE "catalog_episode_variants" RENAME CONSTRAINT "episode_sources_episode_id_episodes_id_fk" TO "catalog_episode_variants_episode_id_catalog_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_episode_variants" RENAME CONSTRAINT "episode_sources_item_id_items_id_fk" TO "catalog_episode_variants_item_id_catalog_variants_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_episodes" RENAME CONSTRAINT "episodes_content_id_contents_id_fk" TO "catalog_episodes_content_id_catalog_contents_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME CONSTRAINT "items_content_id_contents_id_fk" TO "catalog_variants_content_id_catalog_contents_id_fk";--> statement-breakpoint
ALTER TABLE "task_steps" RENAME CONSTRAINT "sync_logs_run_id_sync_runs_id_fk" TO "task_steps_run_id_task_runs_id_fk";
