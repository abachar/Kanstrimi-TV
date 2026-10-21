-- Profile preferences: the playback settings of a profile (the same on every device), the version it
-- chose per title, the last report of each live day (recent channels) and the plays of each title.
-- Every position recorded so far counts as one play, at the time of its last report.
CREATE TABLE "app_plays" (
	"profile_id" integer NOT NULL,
	"content_key" text NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_plays_profile_id_content_key_pk" PRIMARY KEY("profile_id","content_key")
);
--> statement-breakpoint
CREATE TABLE "app_profile_versions" (
	"profile_id" integer NOT NULL,
	"content_key" text NOT NULL,
	"version_id" text NOT NULL,
	"language" text NOT NULL,
	"quality" text NOT NULL,
	"dynamic_range" text,
	"edition" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_profile_versions_profile_id_content_key_pk" PRIMARY KEY("profile_id","content_key")
);
--> statement-breakpoint
ALTER TABLE "app_live_watch" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_profiles" ADD COLUMN "max_quality" text DEFAULT '4K' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_profiles" ADD COLUMN "auto_play_next" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_profiles" ADD COLUMN "remember_versions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_profiles" ADD COLUMN "switch_source_on_failure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_plays" ADD CONSTRAINT "app_plays_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profile_versions" ADD CONSTRAINT "app_profile_versions_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "app_plays" ("profile_id", "content_key", "plays", "first_at", "last_at")
	SELECT "profile_id", "content_key", 1, "updated_at", "updated_at" FROM "app_watch_progress";