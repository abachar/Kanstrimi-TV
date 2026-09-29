ALTER TABLE "contents" ADD COLUMN "release_date" date;--> statement-breakpoint
CREATE INDEX "contents_release_idx" ON "contents" USING btree ("kind","visible","release_date" DESC NULLS LAST,"id");