CREATE TABLE "tmdb_recommendations" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"ids" integer[] DEFAULT '{}' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_recommendations_media_type_tmdb_id_pk" PRIMARY KEY("media_type","tmdb_id")
);
