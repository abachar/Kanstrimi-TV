import type { SQL } from "drizzle-orm";
import {
  compileQuery,
  countLiveChannels,
  EVENTS_THEME,
  type LiveChannel,
  liveChannels,
  type LiveMarket,
  listProfiles,
  liveTree,
  UNKNOWN_THEME,
  watchedMarkets,
} from "@/catalog";
import { getSettings } from "@/config";
import type { Exec } from "./search";

/**
 * The Live screen: one tree (market → theme → channels) the search prunes, and its shortcuts, searches
 * written in advance that each say how many channels they find.
 */

/** A branch's page of channels, and the size under which a whole tree is shown unfolded. */
export const LIVE_PAGE = 50;
const UNFOLDED_MAX = 60;

/** « de Hakim », « d'Inès ». */
const of = (name: string) => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? `d'${name}` : `de ${name}`);
/** A value as the filter language takes it exactly, whatever it holds. */
const quoted = (s: string) => `"${s.replace(/[\\"]/g, "\\$&")}"`;

export type Shortcut = { label: string; title: string; q: string; count: number };

/**
 * The shortcuts: what each profile gets in the app, the channels of the reference, then the names
 * left and the event feeds of the markets the household watches. Each is a search like any other: a
 * click writes it in the box, where it is read and changed.
 */
export async function liveShortcuts(): Promise<Shortcut[]> {
  const [profiles, markets, settings] = await Promise.all([listProfiles(), watchedMarkets(), getSettings()]);
  const here = markets.length ? ` && xtream.marché:${markets.map(quoted).join(",")}` : "";
  const loose = [EVENTS_THEME, UNKNOWN_THEME].map((t) => quoted(t.toLowerCase())).join(",");
  const list: Omit<Shortcut, "count">[] = [
    ...profiles.map((p) => ({
      label: `Dans l'app ${of(p.name)}`,
      title: `Les chaînes que ${p.name} reçoit`,
      q: `profil:${quoted(p.name)}`,
    })),
    { label: "Toutes les chaînes", title: "Les chaînes reconnues, tous marchés, qu'un profil les voie ou non", q: `-thème:${loose}` },
    {
      label: "Non rattachées",
      title: "Les noms des fournisseurs qui ne correspondent à aucune chaîne connue, dans les marchés regardés",
      q: `thème:${quoted(UNKNOWN_THEME.toLowerCase())}${here}`,
    },
    {
      label: "Événements",
      title: "Les flux d'un match ou d'un paiement à la séance, dans les marchés regardés",
      q: `thème:${quoted(EVENTS_THEME.toLowerCase())}${here}`,
    },
  ];
  const counts = await Promise.all(list.map((s) => countLiveChannels(compileQuery(s.q, { kind: "live", lang: settings.tmdb_language }))));
  return list.map((s, i) => ({ ...s, count: counts[i] }));
}

/** The branch a link names (« market|theme », an empty side: the channels without one), or none. */
export function branchOf(open: string): { market: string | null; theme: string | null } | null {
  const at = open.indexOf("|");
  return at < 0 ? null : { market: open.slice(0, at) || null, theme: open.slice(at + 1) || null };
}
export const branchKey = (market: string | null, theme: string | null) => `${market ?? ""}|${theme ?? ""}`;

export type LiveView = {
  markets: LiveMarket[];
  total: number;
  /** The channels already there, by branch: every branch of a small tree, else the one a link opens. */
  loaded: Map<string, LiveChannel[]>;
};

/** The tree a search leaves: small enough, with all its channels; else folded, but for the branch `open` names. */
export async function liveView(ex: Exec, where: SQL | null, open: string): Promise<LiveView> {
  const markets = await liveTree(where, ex);
  const total = markets.reduce((n, m) => n + m.channels, 0);
  const loaded = new Map<string, LiveChannel[]>();
  if (total > 0 && total <= UNFOLDED_MAX) {
    for (const ch of await liveChannels(where, { offset: 0, limit: UNFOLDED_MAX }, ex)) {
      const key = branchKey(ch.market, ch.theme);
      loaded.set(key, [...(loaded.get(key) ?? []), ch]);
    }
    return { markets, total, loaded };
  }
  const branch = branchOf(open);
  if (branch && markets.some((m) => m.market === branch.market && m.themes.some((t) => t.theme === branch.theme)))
    loaded.set(branchKey(branch.market, branch.theme), await liveChannels(where, { ...branch, offset: 0, limit: LIVE_PAGE + 1 }, ex));
  return { markets, total, loaded };
}
