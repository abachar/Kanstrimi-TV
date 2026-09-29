-- The provider's lists as last read, untouched: the `source` step replaces them, `merge` derives the catalogue.
-- UNLOGGED: no WAL, rewritten at every import, lost on a crash (the next import brings them back).
CREATE UNLOGGED TABLE "xtream_categories" (
	"kind" "content_kind" NOT NULL,
	"xtream_id" text NOT NULL,
	"position" integer NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "xtream_categories_kind_xtream_id_pk" PRIMARY KEY("kind","xtream_id")
);
--> statement-breakpoint
CREATE UNLOGGED TABLE "xtream_streams" (
	"kind" "content_kind" NOT NULL,
	"xtream_id" text NOT NULL,
	"position" integer NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "xtream_streams_kind_xtream_id_pk" PRIMARY KEY("kind","xtream_id")
);
--> statement-breakpoint
-- `seen_at` was rewritten on every row at every import; `changed_at` moves only when the provider's copy changes.
ALTER TABLE "catalog_categories" RENAME COLUMN "seen_at" TO "changed_at";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME COLUMN "seen_at" TO "changed_at";--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "match_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- `adult` and `theme` had two writers (the naming, then `channels`): each now keeps its own column and the
-- final value is derived. The current values stand for the name's until the next run recomputes both.
ALTER TABLE "catalog_variants" RENAME COLUMN "adult" TO "name_adult";--> statement-breakpoint
ALTER TABLE "catalog_variants" RENAME COLUMN "theme" TO "name_theme";--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "iptv_adult" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "iptv_theme" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "adult" boolean GENERATED ALWAYS AS (name_adult or iptv_adult) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "theme" text GENERATED ALWAYS AS (coalesce(iptv_theme, name_theme)) STORED;--> statement-breakpoint
-- Cards are copied again only when the TMDB entry is newer than the copy (or the language changed).
ALTER TABLE "catalog_contents" ADD COLUMN "tmdb_adult" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_contents" ADD COLUMN "cards_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_contents" ADD COLUMN "cards_lang" text;--> statement-breakpoint
-- Room on each page for in-place (HOT) updates of the columns no index reads.
ALTER TABLE "catalog_variants" SET (fillfactor = 80);--> statement-breakpoint
ALTER TABLE "catalog_contents" SET (fillfactor = 80);
