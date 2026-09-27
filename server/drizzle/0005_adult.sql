ALTER TABLE "contents" ADD COLUMN "adult" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "adult" boolean DEFAULT false NOT NULL;