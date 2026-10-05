CREATE TABLE "tmdb_extras" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"credits_scene" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_extras_media_type_tmdb_id_pk" PRIMARY KEY("media_type","tmdb_id")
);
