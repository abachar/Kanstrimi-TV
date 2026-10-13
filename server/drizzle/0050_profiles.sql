-- Profiles: the household's persons. The default one, « Hakim », inherits everything recorded so far
-- (positions, « Ma liste », live time, the waitlist) and the three filters of « Filtres », which become
-- its own; the verdicts (kept versions, visible contents) are copied from the columns the step wrote.
CREATE TABLE "app_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar" "bytea",
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judged_at" timestamp with time zone,
	CONSTRAINT "app_profiles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_profiles_default_idx" ON "app_profiles" USING btree ("is_default") WHERE is_default;--> statement-breakpoint
INSERT INTO "app_profiles" ("id", "name", "is_default", "judged_at") VALUES (1, 'Hakim', true, now());--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('app_profiles', 'id'), 1);--> statement-breakpoint
CREATE TABLE "app_profile_filters" (
	"profile_id" integer NOT NULL,
	"kind" "content_kind" NOT NULL,
	"query" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "app_profile_filters_profile_id_kind_pk" PRIMARY KEY("profile_id","kind")
);
--> statement-breakpoint
ALTER TABLE "app_profile_filters" ADD CONSTRAINT "app_profile_filters_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "app_profile_filters" ("profile_id", "kind", "query", "updated_at", "applied_at")
	SELECT 1, "kind", "query", "updated_at", CASE WHEN coalesce((SELECT "value" FROM "settings" WHERE "key" = 'filters_pending'), '') = '' THEN "updated_at" END
	FROM "curation_filters";--> statement-breakpoint
DROP TABLE "curation_filters" CASCADE;--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'filters_pending';--> statement-breakpoint
CREATE TABLE "catalog_variant_profiles" (
	"variant_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	CONSTRAINT "catalog_variant_profiles_variant_id_profile_id_pk" PRIMARY KEY("variant_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_variant_profiles" ADD CONSTRAINT "catalog_variant_profiles_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_profiles" ADD CONSTRAINT "catalog_variant_profiles_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_variant_profiles_profile_idx" ON "catalog_variant_profiles" USING btree ("profile_id","variant_id");--> statement-breakpoint
INSERT INTO "catalog_variant_profiles" ("variant_id", "profile_id") SELECT "id", 1 FROM "catalog_variants" WHERE "hidden_by_rule" IS FALSE;--> statement-breakpoint
CREATE TABLE "catalog_content_profiles" (
	"content_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	CONSTRAINT "catalog_content_profiles_content_id_profile_id_pk" PRIMARY KEY("content_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_content_profiles" ADD CONSTRAINT "catalog_content_profiles_content_id_catalog_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."catalog_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_content_profiles" ADD CONSTRAINT "catalog_content_profiles_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_content_profiles_profile_idx" ON "catalog_content_profiles" USING btree ("profile_id","content_id");--> statement-breakpoint
INSERT INTO "catalog_content_profiles" ("content_id", "profile_id") SELECT "id", 1 FROM "catalog_contents" WHERE "visible";--> statement-breakpoint
ALTER TABLE "app_favorites" ADD COLUMN "profile_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_favorites" ALTER COLUMN "profile_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app_favorites" DROP CONSTRAINT "app_favorites_pkey";--> statement-breakpoint
ALTER TABLE "app_favorites" ADD CONSTRAINT "app_favorites_profile_id_content_key_pk" PRIMARY KEY("profile_id","content_key");--> statement-breakpoint
ALTER TABLE "app_favorites" ADD CONSTRAINT "app_favorites_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_live_watch" ADD COLUMN "profile_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_live_watch" ALTER COLUMN "profile_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app_live_watch" DROP CONSTRAINT "app_live_watch_content_key_day_pk";--> statement-breakpoint
ALTER TABLE "app_live_watch" ADD CONSTRAINT "app_live_watch_profile_id_content_key_day_pk" PRIMARY KEY("profile_id","content_key","day");--> statement-breakpoint
ALTER TABLE "app_live_watch" ADD CONSTRAINT "app_live_watch_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_watch_progress" ADD COLUMN "profile_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_watch_progress" ALTER COLUMN "profile_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app_watch_progress" DROP CONSTRAINT "app_watch_progress_pkey";--> statement-breakpoint
ALTER TABLE "app_watch_progress" ADD CONSTRAINT "app_watch_progress_profile_id_content_key_pk" PRIMARY KEY("profile_id","content_key");--> statement-breakpoint
ALTER TABLE "app_watch_progress" ADD CONSTRAINT "app_watch_progress_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation_waitlist" ADD COLUMN "profile_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "curation_waitlist" ALTER COLUMN "profile_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "curation_waitlist" DROP CONSTRAINT "curation_waitlist_pkey";--> statement-breakpoint
ALTER TABLE "curation_waitlist" ADD CONSTRAINT "curation_waitlist_profile_id_content_key_pk" PRIMARY KEY("profile_id","content_key");--> statement-breakpoint
ALTER TABLE "curation_waitlist" ADD CONSTRAINT "curation_waitlist_profile_id_app_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."app_profiles"("id") ON DELETE cascade ON UPDATE no action;
