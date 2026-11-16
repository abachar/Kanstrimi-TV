-- What the catalogue decides of a provider's stream: one table, named for what it holds. A row per stream, under the
-- stream's id (`xtream_id`), with its title or its channel, how it came there, and what hides it: by hand (`hidden`)
-- or because no profile's filter keeps it (`filtered`).
ALTER TABLE "catalog_variants" RENAME TO "catalog_streams";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME COLUMN "id" TO "xtream_id";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME COLUMN "hidden_manual" TO "hidden";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME COLUMN "hidden_by_rule" TO "filtered";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME CONSTRAINT "catalog_variants_pkey" TO "catalog_streams_pkey";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME CONSTRAINT "catalog_variants_id_xtream_streams_id_fk" TO "catalog_streams_xtream_id_xtream_streams_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME CONSTRAINT "catalog_variants_title_id_catalog_titles_id_fk" TO "catalog_streams_title_id_catalog_titles_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME CONSTRAINT "catalog_variants_channel_id_catalog_channels_id_fk" TO "catalog_streams_channel_id_catalog_channels_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_streams" RENAME CONSTRAINT "catalog_variants_one_content" TO "catalog_streams_one_content";--> statement-breakpoint
ALTER INDEX "catalog_variants_content_idx" RENAME TO "catalog_streams_content_idx";--> statement-breakpoint
ALTER INDEX "catalog_variants_title_idx" RENAME TO "catalog_streams_title_idx";--> statement-breakpoint
ALTER INDEX "catalog_variants_channel_idx" RENAME TO "catalog_streams_channel_idx";
