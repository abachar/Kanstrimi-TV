import type { Kind } from "@/db";
import { kindParam, pageParam, pickEnum } from "../query";

/** What the Live screen lists: the channels the app shows, every channel, the names left to attach, the event feeds. */
export const LIVE_SHOWS = ["shown", "all", "unmatched", "events"] as const;
export type LiveShow = (typeof LIVE_SHOWS)[number];

/**
 * The Live, Films and Séries screens: the kind, and the search in the filter language. Live also says
 * what it lists (`show`), and for anything but the app's view: the market, the page, a name to find.
 */
export type CatalogQuery = { kind: Kind; q: string; show: LiveShow; market: string; name: string; page: number };

/** Old links (`view=xtream`, `cat=`…) land on the same screen: what they carried is ignored. */
export function parseCatalogQuery(q: Record<string, string>): CatalogQuery {
  return {
    kind: kindParam(q.kind),
    q: q.q?.trim() ?? "",
    show: pickEnum(q.show, LIVE_SHOWS, "shown"),
    market: q.market ?? "",
    name: q.name?.trim() ?? "",
    page: pageParam(q.page),
  };
}
