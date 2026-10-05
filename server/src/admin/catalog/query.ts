import type { Kind } from "@/db";
import { kindParam } from "../query";

/** The Live, Films and Séries screens: the kind, and the search in the filter language. */
export type CatalogQuery = { kind: Kind; q: string };

/** Old links (`view=xtream`, `cat=`…) land on the same screen: what they carried is ignored. */
export function parseCatalogQuery(q: Record<string, string>): CatalogQuery {
  return { kind: kindParam(q.kind), q: q.q?.trim() ?? "" };
}
