-- The channels of ours (`curation_channels`) are no table apart any more: what the admin says of a channel is on the
-- channel itself (`aliases`, and `edited`: the fields set by hand). A channel has one theme and a status (`known`,
-- `unknown`, `event`), both written again with the aggregates at the next `group` step.

ALTER TABLE "catalog_channels" ADD COLUMN "status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_channels" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_channels" ADD COLUMN "edited" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_channels" ADD COLUMN "theme" text;--> statement-breakpoint
UPDATE "catalog_channels" c SET
	"theme" = c."themes"[1],
	"status" = CASE
		WHEN EXISTS (SELECT 1 FROM "catalog_variants" v WHERE v."channel_id" = c."id" AND v."channel_name" IS NOT NULL) THEN 'known'
		WHEN c."themes"[1] = 'Événements' THEN 'event'
		ELSE 'unknown' END;--> statement-breakpoint

-- A channel of ours that has variants is the channel they are grouped under: it takes what was said of it.
UPDATE "catalog_channels" c SET
	"status" = 'known',
	"aliases" = k."aliases",
	"iptv_id" = coalesce(k."iptv_id", c."iptv_id"),
	"theme" = coalesce(k."theme", c."theme"),
	"country" = CASE WHEN k."country" IS NULL THEN c."country" ELSE nullif(k."country", '') END,
	"edited" = array_remove(ARRAY[
		CASE WHEN i."name" IS DISTINCT FROM k."name" THEN 'name' END,
		CASE WHEN k."theme" IS NOT NULL THEN 'theme' END,
		CASE WHEN k."country" IS NOT NULL THEN 'country' END], NULL)
FROM "curation_channels" k LEFT JOIN "cache_iptvorg_channels" i ON i."id" = k."iptv_id"
WHERE c."id" = (SELECT v."channel_id" FROM "catalog_variants" v WHERE v."reference_id" = k."id" AND v."channel_id" IS NOT NULL ORDER BY v."id" LIMIT 1);--> statement-breakpoint
-- One without any variant becomes a channel with nothing to play, under the key its name gives (`slug`, as close as SQL writes it).
INSERT INTO "catalog_channels" ("key", "name", "market", "status", "aliases", "iptv_id", "theme", "country", "edited", "added_at")
SELECT 'live:' || k."market" || '-' || trim(BOTH '-' FROM regexp_replace(lower(public.unaccent(replace(k."name", '&', ' and '))), '[^[:alnum:]]+', '-', 'g')),
	k."name", k."market", 'known', k."aliases", k."iptv_id", k."theme", nullif(k."country", ''),
	array_remove(ARRAY[
		CASE WHEN i."name" IS DISTINCT FROM k."name" THEN 'name' END,
		CASE WHEN k."theme" IS NOT NULL THEN 'theme' END,
		CASE WHEN k."country" IS NOT NULL THEN 'country' END], NULL),
	k."created_at"
FROM "curation_channels" k LEFT JOIN "cache_iptvorg_channels" i ON i."id" = k."iptv_id"
WHERE NOT EXISTS (SELECT 1 FROM "catalog_variants" v WHERE v."reference_id" = k."id" AND v."channel_id" IS NOT NULL)
ON CONFLICT ("key") DO UPDATE SET "aliases" = excluded."aliases", "edited" = excluded."edited", "status" = 'known';--> statement-breakpoint

ALTER TABLE "catalog_variants" DROP COLUMN "reference_id";--> statement-breakpoint
DROP TABLE "curation_channels";--> statement-breakpoint
ALTER TABLE "catalog_channels" DROP COLUMN "themes";
