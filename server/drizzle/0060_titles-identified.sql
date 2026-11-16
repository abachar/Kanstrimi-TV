-- A movie or a series is identified once, on its title: what was searched, the TMDB verdict and Claude's reading leave
-- each stream (`catalog_variants`) for `catalog_titles`. A stream only says how it came to its title (`how`) and whether
-- it was put there by hand (`manual`). A stream that was still waiting for TMDB leaves the title without a card it sat
-- on: the next `group` step identifies it.

ALTER TABLE "catalog_titles" ADD COLUMN "search_title" text;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "search_year" integer;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "match_status" "match_status" DEFAULT 'unmatched' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "match_score" real;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "matched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "match_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "ai_kind" text;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "ai_title" text;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "ai_original_title" text;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "ai_year" integer;--> statement-breakpoint
ALTER TABLE "catalog_titles" ADD COLUMN "ai_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "how" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Each title takes what its streams knew: the reading of its first stream, the last verdict, the last reading of Claude.
UPDATE "catalog_titles" t SET
	"search_title" = a."title", "search_year" = a."year",
	"match_status" = CASE WHEN t."tmdb_id" IS NOT NULL THEN 'matched' WHEN t."key" LIKE 'manual:%' THEN 'manual' ELSE 'unmatched' END::"match_status",
	"match_score" = a."score", "matched_at" = a."matched_at", "match_attempts" = coalesce(a."attempts", 0),
	"ai_kind" = a."ai_kind", "ai_title" = a."ai_title", "ai_original_title" = a."ai_original_title", "ai_year" = a."ai_year", "ai_asked_at" = a."ai_asked_at"
FROM (
	SELECT v."title_id",
		(array_agg(coalesce(nullif(s."title", ''), s."name") ORDER BY v."id"))[1] AS "title",
		(array_agg(s."year" ORDER BY v."id"))[1] AS "year",
		max(v."match_score") AS "score", max(v."matched_at") AS "matched_at", max(v."match_attempts") AS "attempts",
		(array_agg(v."ai_kind" ORDER BY v."ai_asked_at" DESC) FILTER (WHERE v."ai_asked_at" IS NOT NULL))[1] AS "ai_kind",
		(array_agg(v."ai_title" ORDER BY v."ai_asked_at" DESC) FILTER (WHERE v."ai_asked_at" IS NOT NULL))[1] AS "ai_title",
		(array_agg(v."ai_original_title" ORDER BY v."ai_asked_at" DESC) FILTER (WHERE v."ai_asked_at" IS NOT NULL))[1] AS "ai_original_title",
		(array_agg(v."ai_year" ORDER BY v."ai_asked_at" DESC) FILTER (WHERE v."ai_asked_at" IS NOT NULL))[1] AS "ai_year",
		max(v."ai_asked_at") AS "ai_asked_at"
	FROM "catalog_variants" v JOIN "xtream_streams" s ON s."id" = v."id"
	WHERE v."title_id" IS NOT NULL
	GROUP BY v."title_id"
) a
WHERE a."title_id" = t."id";--> statement-breakpoint

-- Each stream of a movie or a series: by hand when its match or its key was set by hand; still pending: it leaves its title.
UPDATE "catalog_variants" v SET
	"manual" = m."manual",
	"title_id" = CASE WHEN m."pending" AND NOT m."manual" THEN NULL ELSE v."title_id" END,
	"how" = CASE
		WHEN v."title_id" IS NULL OR (m."pending" AND NOT m."manual") THEN NULL
		WHEN m."manual" THEN 'manual'
		WHEN m."title_tmdb" IS NULL THEN 'none'
		WHEN m."provided" = m."title_tmdb"::text THEN 'provided'
		ELSE 'search' END,
	"content_key" = NULL, "key_override" = NULL, "ai_kind" = NULL, "ai_title" = NULL, "ai_asked_at" = NULL
FROM (
	SELECT v2."id", (v2."match_status" = 'manual' OR v2."key_override" IS NOT NULL) AS "manual", v2."match_status" = 'pending' AS "pending",
		coalesce(nullif(s."raw"->>'tmdb', ''), s."raw"->>'tmdb_id') AS "provided",
		(SELECT t."tmdb_id" FROM "catalog_titles" t WHERE t."id" = v2."title_id") AS "title_tmdb"
	FROM "catalog_variants" v2 JOIN "xtream_streams" s ON s."id" = v2."id"
	WHERE s."kind" <> 'live'
) m
WHERE m."id" = v."id";--> statement-breakpoint

ALTER TABLE "catalog_variants" DROP COLUMN "tmdb_id", DROP COLUMN "match_status", DROP COLUMN "match_score", DROP COLUMN "matched_at",
	DROP COLUMN "match_attempts", DROP COLUMN "ai_original_title", DROP COLUMN "ai_year";--> statement-breakpoint
CREATE INDEX "xtream_streams_reading_idx" ON "xtream_streams" USING btree ("kind","title","year");--> statement-breakpoint
ANALYZE "catalog_titles";--> statement-breakpoint
ANALYZE "catalog_variants";
