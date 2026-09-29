ALTER TABLE "contents" ADD COLUMN "saga_id" integer;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "saga_name" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "saga_poster_path" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "saga_backdrop_path" text;--> statement-breakpoint
CREATE INDEX "contents_saga_idx" ON "contents" USING btree ("saga_id");