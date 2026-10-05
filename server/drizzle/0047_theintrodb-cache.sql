CREATE TABLE "theintrodb_cache" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"season" integer NOT NULL,
	"episode" integer NOT NULL,
	"duration" integer NOT NULL,
	"segments" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theintrodb_cache_media_type_tmdb_id_season_episode_duration_pk" PRIMARY KEY("media_type","tmdb_id","season","episode","duration")
);
