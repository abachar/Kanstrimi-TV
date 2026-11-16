import { sql, type SQL } from "drizzle-orm";
import { db, KINDS, variants, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { allFilters, compileFilter, filtersApplied } from "./filters";
import { listProfiles, markProfileJudged, profileById } from "../profiles";
import { refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The `filters` step, after the grouping: each version judged by the filter of each profile, kept
 * (an `app_profile_streams` row) or left out; a profile without a filter keeps everything. Then
 * `catalog_variants.hidden_by_rule` says « kept by no profile », and the contents whose versions moved
 * count again only what is left: their aggregates, `visible` (seen by one profile), what each profile
 * sees (`app_profile_titles`, `app_profile_channels`) and the waitlist's arrivals. A filter that no longer compiles leaves
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
  const ids = contentIds ? sql`${`{${contentIds.join(",")}}`}::int[]` : null;
  const scope = ids ? sql`and variants.content_id = any(${ids})` : sql``;
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
          delete from app_profile_streams using ${variants}
          where app_profile_streams.xtream_id = variants.id and app_profile_streams.profile_id = ${profile.id}
            and variants.kind = ${kind} ${scope} and not (${keep})
          returning variants.content_id`),
      );
      collect(
        await db.execute<{ content_id: number | null }>(sql`
          insert into app_profile_streams (xtream_id, profile_id)
          select variants.id, ${profile.id} from ${variants}
          where variants.kind = ${kind} ${scope} and (${keep})
          on conflict do nothing
          returning (select coalesce(title_id, channel_id) from catalog_variants where id = xtream_id) as content_id`),
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
  const hidden = sql`not exists (select 1 from app_profile_streams vp where vp.xtream_id = catalog_variants.id)`;
  collect(
    await db.execute<{ content_id: number | null }>(sql`
      update catalog_variants set hidden_by_rule = ${hidden}
      where ${ids ? sql`coalesce(catalog_variants.title_id, catalog_variants.channel_id) = any(${ids}) and` : sql``} catalog_variants.hidden_by_rule is distinct from (${hidden})
      returning coalesce(title_id, channel_id) as content_id`),
  );
  checkCancelled();
  const waitlist_available = touched.size ? await refreshVisibility([...touched]) : 0;
  // The verdict tables move by tens of thousands of rows at once: fresh statistics, or the planner guesses for a day.
  await db.execute(sql`analyze app_profile_streams, app_profile_titles, app_profile_channels`);
  const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from catalog_variants where hidden_by_rule`);
  return { variants_hidden: r.n, waitlist_available };
}
