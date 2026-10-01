CREATE INDEX "catalog_contents_cast_idx" ON "catalog_contents" USING gin ("cast" jsonb_path_ops);
--> statement-breakpoint
UPDATE "catalog_contents" SET "cards_at" = NULL WHERE "tmdb_id" IS NOT NULL;
