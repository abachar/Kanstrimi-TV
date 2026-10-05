ALTER TABLE "catalog_variants" ADD COLUMN "hidden_by_rule" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Until the next grouping, a version keeps the visibility the served languages gave it.
UPDATE "catalog_variants" SET "hidden_by_rule" = "hidden_by_language";--> statement-breakpoint
ALTER TABLE "curation_filter_rules" ADD COLUMN "target" text DEFAULT 'content' NOT NULL;--> statement-breakpoint
-- The queries in the vocabulary of 2026-10-05: the version fields prefixed, the TMDB ones without « -vo ».
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)(langue|lang):', '\1\2variant.langue:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)(langue-vo|vo):', '\1\2langue:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)pays-vo:', '\1\2pays:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)section:', '\1\2xtream.section:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)(catégorie|categorie|cat):', '\1\2xtream.catégorie:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)(nom|name):', '\1\2xtream.nom:', 'g');--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = regexp_replace("query", '(^|\s)(-?)(édition|edition):', '\1\2variant.édition:', 'g');--> statement-breakpoint
-- No rule for every kind any more: one naming a field of the live goes to the live, the others become a film rule and a series rule.
UPDATE "curation_filter_rules" SET "kind" = 'live'
WHERE "kind" IS NULL AND "query" ~ '(^|\s)-?(pays|thème|theme|marché|market|xtream\.section):';--> statement-breakpoint
INSERT INTO "curation_filter_rules" ("name", "kind", "query", "action", "enabled", "position", "target")
SELECT "name", 'series', "query", "action", "enabled", "position", "target" FROM "curation_filter_rules" WHERE "kind" IS NULL;--> statement-breakpoint
UPDATE "curation_filter_rules" SET "kind" = 'vod' WHERE "kind" IS NULL;--> statement-breakpoint
UPDATE "curation_filter_rules" SET "target" = 'variant' WHERE "query" ~ '(^|\s)-?(variant|xtream)\.';--> statement-breakpoint
-- The served languages become a rule on versions, for films and for series.
INSERT INTO "curation_filter_rules" ("name", "kind", "query", "action", "enabled", "position", "target")
SELECT 'Masquer les versions hors ' || replace(s."value", ',', ', '), k."kind"::content_kind,
  '-variant.langue:"' || replace(lower(s."value"), ',', '","') || '"', 'hide', true, 0, 'variant'
FROM "settings" s, (VALUES ('vod'), ('series')) AS k("kind")
WHERE s."key" = 'served_languages' AND s."value" <> '';--> statement-breakpoint
DELETE FROM "settings" WHERE "key" IN ('served_languages', 'languages_pending');--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('rules_pending', 'group') ON CONFLICT ("key") DO UPDATE SET "value" = 'group';--> statement-breakpoint
ALTER TABLE "curation_filter_rules" ALTER COLUMN "kind" SET NOT NULL;
