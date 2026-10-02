-- Rules move to the filter language: a regex on the name becomes `nom:/…/`, on a category `catégorie:/…/`
-- (a « / » of the regex escaped). Every query is case-insensitive, as the « i » flag of every rule was.
ALTER TABLE "curation_filter_rules" ADD COLUMN "query" text;--> statement-breakpoint
UPDATE "curation_filter_rules" SET "query" = (CASE "target" WHEN 'category' THEN 'catégorie:/' ELSE 'nom:/' END) || replace("pattern", '/', '\/') || '/';--> statement-breakpoint
ALTER TABLE "curation_filter_rules" ALTER COLUMN "query" SET NOT NULL;
