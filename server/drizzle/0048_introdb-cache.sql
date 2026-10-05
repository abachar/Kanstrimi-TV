CREATE TABLE "introdb_cache" (
	"imdb_id" text NOT NULL,
	"season" integer NOT NULL,
	"episode" integer NOT NULL,
	"segments" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "introdb_cache_imdb_id_season_episode_pk" PRIMARY KEY("imdb_id","season","episode")
);
