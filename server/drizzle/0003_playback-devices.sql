CREATE TYPE "public"."device_status" AS ENUM('pending', 'approved', 'revoked');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"token_hash" text,
	"wrapped_key" text,
	"status" "device_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_ip" text,
	"created_ip" text,
	CONSTRAINT "devices_code_unique" UNIQUE("code"),
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "episode_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"xtream_id" text NOT NULL,
	"container" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" integer NOT NULL,
	"key" text NOT NULL,
	"season" integer NOT NULL,
	"number" integer NOT NULL,
	"title" text,
	"overview" text,
	"runtime" integer,
	"still_path" text,
	"air_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"content_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"content_key" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"duration" integer NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_sources" ADD CONSTRAINT "episode_sources_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_sources" ADD CONSTRAINT "episode_sources_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_sources_episode_item_idx" ON "episode_sources" USING btree ("episode_id","item_id");--> statement-breakpoint
CREATE INDEX "episode_sources_item_idx" ON "episode_sources" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_content_season_number_idx" ON "episodes" USING btree ("content_id","season","number");