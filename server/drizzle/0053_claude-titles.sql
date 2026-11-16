-- Claude's reading of the names TMDB gave up on (`enrich`): the kind it sees, the title TMDB would know,
-- its original title and year, and when it was asked (null = never).
ALTER TABLE "catalog_variants" ADD COLUMN "ai_kind" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "ai_title" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "ai_original_title" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "ai_year" integer;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "ai_asked_at" timestamp with time zone;