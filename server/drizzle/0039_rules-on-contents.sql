ALTER TABLE "catalog_contents" ADD COLUMN "hidden_by_rule" boolean;--> statement-breakpoint
ALTER TABLE "catalog_categories" DROP COLUMN "hidden_by_rule";--> statement-breakpoint
ALTER TABLE "catalog_variants" DROP COLUMN "hidden_by_rule";--> statement-breakpoint
-- The rules now judge contents. Until the next `filters` step, a content keeps the visibility it had.
UPDATE "catalog_contents" SET "hidden_by_rule" = NOT "visible";--> statement-breakpoint
-- A variant rule read on contents may change meaning (`nom:/\|IT\|/` would hide every film with one Italian
-- variant): every rule is switched off but the live perimeter, written for contents, and kept for reference.
UPDATE "curation_filter_rules" SET "enabled" = false
WHERE "query" NOT IN (
  '-marché:"fr" -marché:"ar"',
  'marché:"ar" -pays:maroc -thème:"sport"',
  'marché:"ar" thème:"sport" pays:ae,bh,dz,eg,iq,jo,kw,lb,ly,om,ps,qa,sa,sy,tn,ye'
);--> statement-breakpoint
INSERT INTO "curation_filter_rules" ("name", "kind", "query", "action", "enabled", "position")
SELECT r.name, 'live', r.query, 'hide', true, 0
FROM (VALUES
  ('Direct : masquer tout sauf France et Monde arabe', '-marché:"fr" -marché:"ar"'),
  ('Direct : Monde arabe, masquer hors Maroc et hors Sport', 'marché:"ar" -pays:maroc -thème:"sport"'),
  ('Direct : Monde arabe, masquer le Sport des pays autres que le Maroc', 'marché:"ar" thème:"sport" pays:ae,bh,dz,eg,iq,jo,kw,lb,ly,om,ps,qa,sa,sy,tn,ye')
) AS r(name, query)
WHERE NOT EXISTS (SELECT 1 FROM "curation_filter_rules" f WHERE f."query" = r.query);--> statement-breakpoint
-- Films and series: French, original version and Arabic; the « PT, IT et TR » and « VOST » rules did it by name.
INSERT INTO "settings" ("key", "value") VALUES ('served_languages', 'VF,VO,AR') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('rules_pending', '1') ON CONFLICT ("key") DO UPDATE SET "value" = '1';
