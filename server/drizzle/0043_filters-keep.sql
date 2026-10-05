CREATE TABLE "curation_filters" (
	"kind" "content_kind" PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A filter keeps what matches. The enabled rules of a kind, which hid, become one filter that keeps what none of them matches:
-- the same catalogue, to rewrite in positive terms in the admin. A space no longer means « and »: written `&&`, outside quotes.
INSERT INTO "curation_filters" ("kind", "query")
SELECT "kind", string_agg('-(' || regexp_replace(trim("query"), '\s+(?=([^"]*"[^"]*")*[^"]*$)', ' && ', 'g') || ')', ' && ' ORDER BY "name", "id")
FROM "curation_filter_rules" WHERE "enabled" GROUP BY "kind";--> statement-breakpoint
ALTER TABLE "catalog_variants" ALTER COLUMN "hidden_by_rule" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "catalog_variants" ALTER COLUMN "hidden_by_rule" DROP NOT NULL;--> statement-breakpoint
-- The verdict on contents goes to their versions, every filter now judging versions: a content hidden, or not judged yet, leaves its versions out.
UPDATE "catalog_variants" v SET "hidden_by_rule" = true
FROM "catalog_contents" c WHERE c."id" = v."content_id" AND c."hidden_by_rule" IS DISTINCT FROM false;--> statement-breakpoint
ALTER TABLE "catalog_contents" DROP COLUMN "hidden_by_rule";--> statement-breakpoint
UPDATE "settings" SET "key" = 'filters_pending' WHERE "key" = 'rules_pending';
