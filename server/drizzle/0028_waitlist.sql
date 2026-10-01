CREATE TABLE "curation_waitlist" (
	"content_key" text PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"poster_path" text,
	"release_date" date,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone,
	"started_at" timestamp with time zone
);
