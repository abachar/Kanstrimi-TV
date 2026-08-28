CREATE TYPE "public"."content_kind" AS ENUM('live', 'vod', 'series');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'matched', 'unmatched', 'manual', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."rule_action" AS ENUM('hide', 'keep');--> statement-breakpoint
CREATE TYPE "public"."rule_target" AS ENUM('name', 'category');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"xtream_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"hidden_by_rule" boolean DEFAULT false NOT NULL,
	"hidden_manual" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filter_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "content_kind",
	"target" "rule_target" DEFAULT 'name' NOT NULL,
	"pattern" text NOT NULL,
	"flags" text DEFAULT 'i' NOT NULL,
	"action" "rule_action" DEFAULT 'hide' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "info_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"xtream_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"xtream_id" integer NOT NULL,
	"name" text NOT NULL,
	"category_xtream_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"hidden_by_rule" boolean DEFAULT false NOT NULL,
	"hidden_manual" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"clean_title" text,
	"year" integer,
	"tmdb_id" integer,
	"match_status" "match_status" DEFAULT 'pending' NOT NULL,
	"match_score" real,
	"matched_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"message" text,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE "tmdb_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"lang" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_xtream_idx" ON "categories" USING btree ("kind","xtream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "info_cache_idx" ON "info_cache" USING btree ("kind","xtream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_kind_xtream_idx" ON "items" USING btree ("kind","xtream_id");--> statement-breakpoint
CREATE INDEX "items_kind_cat_idx" ON "items" USING btree ("kind","category_xtream_id");--> statement-breakpoint
CREATE INDEX "items_match_idx" ON "items" USING btree ("kind","match_status");--> statement-breakpoint
CREATE UNIQUE INDEX "tmdb_cache_idx" ON "tmdb_cache" USING btree ("media_type","tmdb_id","lang");