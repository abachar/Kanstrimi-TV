-- A channel is identified on the channel, as a title is on the title: its name in the reference, its iptv-org channel,
-- its theme, its country and what Claude read in its name are the channel's; a live stream only says which channel it
-- is on, how it came there (`how`) and whether by hand (`manual`). The `channels` step attaches the streams itself.

ALTER TABLE "catalog_channels" ADD COLUMN "ai_kind" text;--> statement-breakpoint
ALTER TABLE "catalog_channels" ADD COLUMN "ai_name" text;--> statement-breakpoint
ALTER TABLE "catalog_channels" ADD COLUMN "ai_asked_at" timestamp with time zone;--> statement-breakpoint

-- What Claude read in the name of a channel the reference does not know: the last reading among its streams.
UPDATE "catalog_channels" c SET "ai_kind" = a."ai_kind", "ai_name" = a."ai_title", "ai_asked_at" = a."ai_asked_at"
FROM (
	SELECT v."channel_id",
		(array_agg(v."ai_kind" ORDER BY v."ai_asked_at" DESC))[1] AS "ai_kind",
		(array_agg(v."ai_title" ORDER BY v."ai_asked_at" DESC))[1] AS "ai_title",
		max(v."ai_asked_at") AS "ai_asked_at"
	FROM "catalog_variants" v
	WHERE v."channel_id" IS NOT NULL AND v."ai_asked_at" IS NOT NULL AND v."channel_name" IS NULL
	GROUP BY v."channel_id"
) a
WHERE a."channel_id" = c."id";--> statement-breakpoint
-- A stream the reference found through the name Claude read sits on that channel: the reading stays where the next
-- one looks for it, on a channel of the stream's own name (its key, as close as SQL writes `slug`), with nothing to play.
INSERT INTO "catalog_channels" ("key", "name", "market", "status", "ai_kind", "ai_name", "ai_asked_at", "added_at")
SELECT DISTINCT ON (x."key") x."key", x."title", x."market", 'unknown', x."ai_kind", x."ai_title", x."ai_asked_at", now()
FROM (
	SELECT 'live:x:' || coalesce(s."market" || '-', '') || trim(BOTH '-' FROM regexp_replace(
			lower(public.unaccent(replace(coalesce(nullif(s."title", ''), s."name"), '&', ' and '))), '[^[:alnum:]]+', '-', 'g')) AS "key",
		coalesce(nullif(s."title", ''), s."name") AS "title", s."market", v."ai_kind", v."ai_title", v."ai_asked_at"
	FROM "catalog_variants" v JOIN "xtream_streams" s ON s."id" = v."id"
	WHERE s."kind" = 'live' AND v."ai_asked_at" IS NOT NULL AND v."channel_name" IS NOT NULL
) x
ORDER BY x."key", x."ai_asked_at" DESC
ON CONFLICT ("key") DO UPDATE SET "ai_kind" = excluded."ai_kind", "ai_name" = excluded."ai_name", "ai_asked_at" = excluded."ai_asked_at";--> statement-breakpoint
-- Adult: iptv-org says so, or every one of its streams' names does.
UPDATE "catalog_channels" c SET "adult" = a."adult"
FROM (
	SELECT v."channel_id", bool_or(v."iptv_adult") OR bool_and(s."adult") AS "adult"
	FROM "catalog_variants" v JOIN "xtream_streams" s ON s."id" = v."id"
	WHERE v."channel_id" IS NOT NULL
	GROUP BY v."channel_id"
) a
WHERE a."channel_id" = c."id" AND c."adult" IS DISTINCT FROM a."adult";--> statement-breakpoint

-- Each live stream: how it came to its channel, and whether it was put there by hand (a pin, a key set by hand).
UPDATE "catalog_variants" v SET
	"how" = CASE WHEN v."key_override" IS NOT NULL OR v."iptv_match" IS NOT DISTINCT FROM 'manual' THEN 'manual' ELSE v."iptv_match" END,
	"manual" = (v."key_override" IS NOT NULL OR v."iptv_match" IS NOT DISTINCT FROM 'manual')
FROM "xtream_streams" s
WHERE s."id" = v."id" AND s."kind" = 'live';--> statement-breakpoint

ALTER TABLE "catalog_variants" DROP COLUMN "content_key", DROP COLUMN "key_override", DROP COLUMN "ai_kind", DROP COLUMN "ai_title",
	DROP COLUMN "ai_asked_at", DROP COLUMN "iptv_adult", DROP COLUMN "iptv_theme", DROP COLUMN "iptv_id", DROP COLUMN "iptv_match",
	DROP COLUMN "country", DROP COLUMN "channel_name";--> statement-breakpoint
ANALYZE "catalog_channels";--> statement-breakpoint
ANALYZE "catalog_variants";
