-- Typo-tolerant search: trigrams (pg_trgm) over the accent-free titles (unaccent). Both extensions
-- are "trusted": the database owner creates them, no superuser needed.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
-- unaccent() is only STABLE (its dictionary could change); pinning the dictionary makes this wrapper
-- safe to declare IMMUTABLE, which an index expression requires.
CREATE OR REPLACE FUNCTION search_titles(title text, original_title text, title_en text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, concat_ws(' ', title, original_title, title_en))) $$;
--> statement-breakpoint
CREATE INDEX "catalog_contents_titles_trgm_idx" ON "catalog_contents" USING gin (search_titles("title", "original_title", "title_en") gin_trgm_ops);