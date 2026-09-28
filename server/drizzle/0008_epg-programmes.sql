CREATE TABLE "epg_programmes" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"overview" text,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "epg_programmes_channel_start_idx" ON "epg_programmes" USING btree ("channel_id","start_at");--> statement-breakpoint
CREATE INDEX "epg_programmes_end_idx" ON "epg_programmes" USING btree ("end_at");