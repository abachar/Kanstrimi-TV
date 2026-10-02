-- The logo rule changed (no-language logos only for French or English works): copy the cards with a logo again at the next grouping.
UPDATE "catalog_contents" SET "cards_at" = NULL WHERE "title_logo_path" IS NOT NULL;
