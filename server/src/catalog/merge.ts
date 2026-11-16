import { client as pg } from "@/db";
import { runNaming } from "./grouping/group";
import { withCatalogLock } from "./lock";

/**
 * The `merge` step, after `source` wrote the providers' lists (`xtream_streams`, by difference): every
 * stream that is not a separator gets its variant (`catalog_variants`, under the stream's id), where the
 * catalogue keeps what it decides about it; a variant goes with its stream. Then the names are read
 * (`runNaming`, which writes only what changed).
 */
export type MergeStats = { items_named: number };

export function runMerge(): Promise<MergeStats> {
  return withCatalogLock(async () => {
    // A stream that has its variant and no reading was renamed by the provider (the import cleared its
    // `title`; a new one has no variant yet): its TMDB match goes back to pending (a manual one stays)
    // and what Claude read in the old name is forgotten.
    await pg`
      update catalog_variants v set
        match_status = case when v.match_status in ('matched', 'unmatched') then 'pending'::match_status else v.match_status end,
        match_attempts = 0, ai_kind = null, ai_title = null, ai_original_title = null, ai_year = null, ai_asked_at = null
      from xtream_streams s
      where s.id = v.id and s.title is null and not s.separator
        and (v.match_status in ('matched', 'unmatched') or v.match_attempts <> 0 or v.ai_kind is not null or v.ai_asked_at is not null)`;
    await pg`
      insert into catalog_variants (id, match_status)
      select s.id, case when s.kind = 'live' then 'skipped'::match_status else 'pending'::match_status end
      from xtream_streams s
      where not s.separator and not exists (select 1 from catalog_variants v where v.id = s.id)`;
    // An entry the provider turned into a separator line is no version any more.
    await pg`delete from catalog_variants v using xtream_streams s where s.id = v.id and s.separator`;
    return runNaming();
  });
}
