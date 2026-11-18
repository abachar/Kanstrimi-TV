-- What a player measured in a stream it opened: the size of its picture, and when. It makes the stream's quality,
-- `quality` then being the measure and `announced_quality` what the name says.
ALTER TABLE "xtream_streams" ADD COLUMN "announced_quality" text;--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD COLUMN "measured_width" integer;--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD COLUMN "measured_height" integer;--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD COLUMN "measured_at" timestamp with time zone;
