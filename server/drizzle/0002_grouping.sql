CREATE TABLE "contents" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" "content_kind" NOT NULL,
	"tmdb_id" integer,
	"title" text NOT NULL,
	"original_title" text,
	"year" integer,
	"end_year" integer,
	"poster_path" text,
	"backdrop_path" text,
	"overview" text,
	"rating" real,
	"vote_count" integer,
	"genre_ids" integer[] DEFAULT '{}' NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"runtime" integer,
	"certification" text,
	"cast" jsonb,
	"director" text,
	"trailer_key" text,
	"status" text,
	"market" text,
	"logo_url" text,
	"category_xtream_id" text,
	"channel_number" integer,
	"epg_channel_id" text,
	"variant_count" integer DEFAULT 0 NOT NULL,
	"max_quality_rank" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"dynamic_range" text,
	"visible" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"search" "tsvector",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "content_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "key_override" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "market" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "quality" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "quality_rank" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "dynamic_range" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "season_hint" integer;--> statement-breakpoint
CREATE INDEX "contents_list_idx" ON "contents" USING btree ("kind","visible","added_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "contents_title_idx" ON "contents" USING btree ("kind","visible","title","id");--> statement-breakpoint
CREATE INDEX "contents_rating_idx" ON "contents" USING btree ("kind","visible","rating" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "contents_year_idx" ON "contents" USING btree ("kind","visible","year" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "contents_genres_idx" ON "contents" USING gin ("genre_ids");--> statement-breakpoint
CREATE INDEX "contents_search_idx" ON "contents" USING gin ("search");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_content_idx" ON "items" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "items_content_key_idx" ON "items" USING btree ("content_key");