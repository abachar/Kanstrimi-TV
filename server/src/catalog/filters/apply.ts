import { sql, type SQL } from "drizzle-orm";
import { db, KINDS, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { allFilters, compileFilter, filtersApplied } from "./filters";
import { listProfiles, markProfileJudged, profileById } from "../profiles";
import { refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The `filters` step, after the grouping: each version judged by the filter of each profile, kept
 * (a `catalog_variant_profiles` row) or left out; a profile without a filter keeps everything. Then
 * `catalog_variants.hidden_by_rule` says « kept by no profile », and the contents whose versions moved
 * count again only what is left: their aggregates, `visible` (seen by one profile), what each profile
 * sees (`catalog_content_profiles`) and the waitlist's arrivals. A filter that no longer compiles leaves
 * its kind as it was for that profile, said in the log. `contentIds`: only the versions of those (a
 * manual regroup); `profileId`: only that profile (« Appliquer maintenant », a profile just created).
 */
export function applyFilters(opts: { contentIds?: number[]; profileId?: number } = {}) {
  return withCatalogLock(() => apply(opts.contentIds, opts.profileId));
}

async function apply(contentIds?: number[], profileId?: number) {
  if (contentIds && !contentIds.length) return { variants_hidden: 0, waitlist_available: 0 };
  const profiles = profileId === undefined ? await listProfiles() : [await profileById(profileId)].filter((p) => p !== null);
  const filters = await allFilters();
  const scope = contentIds ? sql`and catalog_variants.content_id = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  const touched = new Set<number>();
  const collect = (rows: { content_id: number | null }[]) => {
    for (const r of rows) if (r.content_id !== null) touched.add(r.content_id);
  };
  for (const profile of profiles) {
    const judged: Kind[] = [];
    for (const kind of KINDS as readonly Kind[]) {
      checkCancelled();
      const filter = filters.get(profile.id)?.[kind];
      let keep: SQL = sql`true`;
      if (filter?.query) {
        const where = await compileFilter(filter.query, kind);
        if (typeof where === "string") {
          console.warn(`[filtres] filtre ${kind} du profil « ${profile.name} » ignoré : ${where}`);
          continue;
        }
        keep = sql`coalesce(${where}, false)`;
      }
      collect(
        await db.execute<{ content_id: number | null }>(sql`
          delete from catalog_variant_profiles using catalog_variants
          where catalog_variant_profiles.variant_id = catalog_variants.id and catalog_variant_profiles.profile_id = ${profile.id}
            and catalog_variants.kind = ${kind} ${scope} and not (${keep})
          returning catalog_variants.content_id`),
      );
      collect(
        await db.execute<{ content_id: number | null }>(sql`
          insert into catalog_variant_profiles (variant_id, profile_id)
          select catalog_variants.id, ${profile.id} from catalog_variants
          where catalog_variants.kind = ${kind} ${scope} and (${keep})
          on conflict do nothing
          returning (select content_id from catalog_variants where id = variant_id) as content_id`),
      );
      if (filter) judged.push(kind);
    }
    if (!contentIds) {
      await filtersApplied(profile.id, judged);
      await markProfileJudged(profile.id);
    }
  }
  checkCancelled();
  // Left out by every profile: the union the rest of the catalogue (aggregates, EPG, search) reads.
  const hidden = sql`not exists (select 1 from catalog_variant_profiles vp where vp.variant_id = catalog_variants.id)`;
  collect(
    await db.execute<{ content_id: number | null }>(sql`
      update catalog_variants set hidden_by_rule = ${hidden}
      where true ${scope} and catalog_variants.hidden_by_rule is distinct from (${hidden})
      returning content_id`),
  );
  checkCancelled();
  const waitlist_available = touched.size ? await refreshVisibility([...touched]) : 0;
  // The verdict tables move by tens of thousands of rows at once: fresh statistics, or the planner guesses for a day.
  await db.execute(sql`analyze catalog_variant_profiles, catalog_content_profiles`);
  const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from catalog_variants where hidden_by_rule`);
  return { variants_hidden: r.n, waitlist_available };
}
