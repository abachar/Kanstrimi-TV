CREATE TABLE "studios" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"logo_path" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trending" (
	"media_type" text NOT NULL,
	"rank" integer NOT NULL,
	"tmdb_id" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trending_media_type_rank_pk" PRIMARY KEY("media_type","rank")
);
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "company_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "network_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "studios_kind_tmdb_idx" ON "studios" USING btree ("kind","tmdb_id");--> statement-breakpoint
CREATE INDEX "contents_companies_idx" ON "contents" USING gin ("company_ids");--> statement-breakpoint
CREATE INDEX "contents_networks_idx" ON "contents" USING gin ("network_ids");