ALTER TABLE "contents" ADD COLUMN "themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "theme" text;