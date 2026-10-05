CREATE TABLE "skipdb_segments" (
	"id" integer PRIMARY KEY NOT NULL,
	"imdb_id" text NOT NULL,
	"season" integer NOT NULL,
	"episode" integer NOT NULL,
	"kind" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "tmdb_extras" ADD COLUMN "imdb_id" text;--> statement-breakpoint
CREATE INDEX "skipdb_segments_title_idx" ON "skipdb_segments" USING btree ("imdb_id","season","episode");