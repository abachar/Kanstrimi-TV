-- A rule only hides now, in no order. A « keep » rule cannot be read as one: switched off, kept for reference.
UPDATE "curation_filter_rules" SET "enabled" = false, "name" = "name" || ' (ancienne règle « garder »)' WHERE "action" = 'keep';--> statement-breakpoint
ALTER TABLE "curation_filter_rules" DROP COLUMN "action";--> statement-breakpoint
ALTER TABLE "curation_filter_rules" DROP COLUMN "position";--> statement-breakpoint
DROP TYPE "public"."rule_action";