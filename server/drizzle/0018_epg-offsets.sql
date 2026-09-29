CREATE TABLE "epg_offsets" (
	"pattern" text PRIMARY KEY NOT NULL,
	"minutes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "epg_programmes" ADD COLUMN "offset_minutes" integer DEFAULT 0 NOT NULL;