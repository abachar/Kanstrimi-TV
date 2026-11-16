-- The words of a profile's filter carry their prefix: `catalogue.` for our entry, `xtream.` for a
-- provider's stream (`variant.` is gone). The market, the quality and the dynamic range are a stream's.
-- Only names outside quotes are rewritten.
UPDATE "app_profile_filters" SET "query" = regexp_replace("query", '(^|[\s(|&-])variant\.(?=[^\s:"]+:)(?=([^"]*"[^"]*")*[^"]*$)', '\1xtream.', 'gi');--> statement-breakpoint
UPDATE "app_profile_filters" SET "query" = regexp_replace("query", '(^|[\s(|&-])(march[ée]|market|qualit[ée]|quality|dynamique|hdr):(?=([^"]*"[^"]*")*[^"]*$)', '\1xtream.\2:', 'gi');--> statement-breakpoint
UPDATE "app_profile_filters" SET "query" = regexp_replace("query", '(^|[\s(|&-])(titre|title|pays|country|th[èe]me|genre|langue|lang|studio|saga|classification|certification|ann[ée]e|year|note|rating|votes|tmdb|adulte|adult):(?=([^"]*"[^"]*")*[^"]*$)', '\1catalogue.\2:', 'gi');
