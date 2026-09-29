DROP INDEX "contents_release_idx";--> statement-breakpoint
DROP INDEX "contents_rating_idx";--> statement-breakpoint
DROP INDEX "contents_year_idx";--> statement-breakpoint
CREATE INDEX "contents_release_idx" ON "contents" USING btree ("kind","visible",coalesce("release_date", '0001-01-01'::date) desc,"id");--> statement-breakpoint
CREATE INDEX "contents_rating_idx" ON "contents" USING btree ("kind","visible",coalesce("rating", 0) desc,"id");--> statement-breakpoint
CREATE INDEX "contents_year_idx" ON "contents" USING btree ("kind","visible",coalesce("year", 0) desc,"id");