-- Provider accounts: the Xtream account leaves the environment for a table, one row per provider.
-- Every row the provider wrote (raw copy, categories, variants, series info) now says which account
-- it came from. The catalogue in place is attached to a first account, created empty here; the server
-- fills its URL and credentials from XTREAM_URL / XTREAM_USERNAME / XTREAM_PASSWORD at the next start.
CREATE TABLE "provider_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "provider_accounts" ("name", "url", "username", "password", "position")
	SELECT 'Fournisseur', '', '', '', 1
	WHERE EXISTS (SELECT 1 FROM "catalog_variants") OR EXISTS (SELECT 1 FROM "xtream_streams")
	   OR EXISTS (SELECT 1 FROM "catalog_categories") OR EXISTS (SELECT 1 FROM "xtream_info_cache");--> statement-breakpoint
DROP INDEX "catalog_categories_kind_xtream_idx";--> statement-breakpoint
DROP INDEX "catalog_variants_kind_xtream_idx";--> statement-breakpoint
DROP INDEX "catalog_variants_kind_cat_idx";--> statement-breakpoint
DROP INDEX "xtream_info_cache_idx";--> statement-breakpoint
ALTER TABLE "xtream_categories" DROP CONSTRAINT "xtream_categories_kind_xtream_id_pk";--> statement-breakpoint
ALTER TABLE "xtream_streams" DROP CONSTRAINT "xtream_streams_kind_xtream_id_pk";--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "xtream_categories" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "xtream_info_cache" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD COLUMN "account_id" integer;--> statement-breakpoint
UPDATE "catalog_categories" SET "account_id" = (SELECT min("id") FROM "provider_accounts");--> statement-breakpoint
UPDATE "catalog_variants" SET "account_id" = (SELECT min("id") FROM "provider_accounts");--> statement-breakpoint
UPDATE "xtream_categories" SET "account_id" = (SELECT min("id") FROM "provider_accounts");--> statement-breakpoint
UPDATE "xtream_info_cache" SET "account_id" = (SELECT min("id") FROM "provider_accounts");--> statement-breakpoint
UPDATE "xtream_streams" SET "account_id" = (SELECT min("id") FROM "provider_accounts");--> statement-breakpoint
ALTER TABLE "catalog_categories" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_variants" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "xtream_categories" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "xtream_info_cache" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "xtream_streams" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "xtream_categories" ADD CONSTRAINT "xtream_categories_account_id_kind_xtream_id_pk" PRIMARY KEY("account_id","kind","xtream_id");--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD CONSTRAINT "xtream_streams_account_id_kind_xtream_id_pk" PRIMARY KEY("account_id","kind","xtream_id");--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xtream_categories" ADD CONSTRAINT "xtream_categories_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xtream_info_cache" ADD CONSTRAINT "xtream_info_cache_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xtream_streams" ADD CONSTRAINT "xtream_streams_account_id_provider_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_categories_kind_xtream_idx" ON "catalog_categories" USING btree ("account_id","kind","xtream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_kind_xtream_idx" ON "catalog_variants" USING btree ("account_id","kind","xtream_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_kind_cat_idx" ON "catalog_variants" USING btree ("account_id","kind","category_xtream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xtream_info_cache_idx" ON "xtream_info_cache" USING btree ("account_id","kind","xtream_id");
