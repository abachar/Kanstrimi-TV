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
    // `title`; a new one has no variant yet): a movie or a series leaves its title to be identified again
    // under its new name (one attached by hand stays). A channel's stream is read again by `channels` anyway.
    await pg`
      update catalog_variants v set title_id = null, how = null
      from xtream_streams s
      where s.id = v.id and s.title is null and not s.separator and v.title_id is not null and not v.manual`;
    await pg`
      insert into catalog_variants (id)
      select s.id
      from xtream_streams s
      where not s.separator and not exists (select 1 from catalog_variants v where v.id = s.id)`;
    // An entry the provider turned into a separator line is no version any more.
    await pg`delete from catalog_variants v using xtream_streams s where s.id = v.id and s.separator`;
    return runNaming();
  });
}
