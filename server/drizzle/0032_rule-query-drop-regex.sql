ALTER TABLE "curation_filter_rules" DROP COLUMN "target";--> statement-breakpoint
ALTER TABLE "curation_filter_rules" DROP COLUMN "pattern";--> statement-breakpoint
ALTER TABLE "curation_filter_rules" DROP COLUMN "flags";--> statement-breakpoint
DROP TYPE "public"."rule_target";