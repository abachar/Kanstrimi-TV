import type { Kind } from "@/db";
import { kindParam } from "../query";

/**
 * The Live, Films and Séries screens: the kind, and the search in the filter language. Live also says
 * which branch of its tree is open (`open`: « market|theme », where a form comes back to).
 */
export type CatalogQuery = { kind: Kind; q: string; open: string };

/** Old links (`view=xtream`, `show=`, `market=`…) land on the same screen: what they carried is ignored. */
export function parseCatalogQuery(q: Record<string, string>): CatalogQuery {
  return { kind: kindParam(q.kind), q: q.q?.trim() ?? "", open: q.open ?? "" };
}
