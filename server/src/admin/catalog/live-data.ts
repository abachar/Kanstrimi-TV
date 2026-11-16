import type { SQL } from "drizzle-orm";
import {
  compileQuery,
  countLiveChannels,
  EVENTS_THEME,
  type LiveChannel,
  liveChannels,
  type LivePlace,
  listProfiles,
  liveTree,
  placeKey,
  UNKNOWN_THEME,
  watchedPlaces,
} from "@/catalog";
import { getSettings } from "@/config";
import type { Exec } from "./search";

/**
 * The Live screen: one tree (place → theme → channels) the search prunes, and its shortcuts, searches
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
 * left and the event feeds of the countries and regions the household watches. Each is a search like any
 * other: a click writes it in the box, where it is read and changed.
 */
export async function liveShortcuts(): Promise<Shortcut[]> {
  const [profiles, watched, settings] = await Promise.all([listProfiles(), watchedPlaces(), getSettings()]);
  const where = [
    watched.countries.length ? `pays:${watched.countries.map((c) => c.toLowerCase()).join(",")}` : "",
    watched.regions.length ? `région:${watched.regions.map(quoted).join(",")}` : "",
  ].filter(Boolean);
  const here = where.length > 1 ? ` && (${where.join(" || ")})` : where.length ? ` && ${where[0]}` : "";
  const loose = [EVENTS_THEME, UNKNOWN_THEME].map((t) => quoted(t.toLowerCase())).join(",");
  const list: Omit<Shortcut, "count">[] = [
    ...profiles.map((p) => ({
      label: `Dans l'app ${of(p.name)}`,
      title: `Les chaînes que ${p.name} reçoit`,
      q: `profil:${quoted(p.name)}`,
    })),
    { label: "Toutes les chaînes", title: "Les chaînes reconnues, tous pays, qu'un profil les voie ou non", q: `-thème:${loose}` },
    {
      label: "Non rattachées",
      title: "Les noms des fournisseurs qui ne correspondent à aucune chaîne connue, dans les pays et régions regardés",
      q: `thème:${quoted(UNKNOWN_THEME.toLowerCase())}${here}`,
    },
    {
      label: "Événements",
      title: "Les flux d'un match ou d'un paiement à la séance, dans les pays et régions regardés",
      q: `thème:${quoted(EVENTS_THEME.toLowerCase())}${here}`,
    },
  ];
  const counts = await Promise.all(list.map((s) => countLiveChannels(compileQuery(s.q, { kind: "live", lang: settings.tmdb_language }))));
  return list.map((s, i) => ({ ...s, count: counts[i] }));
}

/** The branch a link names (« place|theme », the place by its key, no theme: the channels without one), or none. */
export function branchOf(open: string): { place: string; theme: string | null } | null {
  const at = open.indexOf("|");
  return at < 0 ? null : { place: open.slice(0, at), theme: open.slice(at + 1) || null };
}
export const branchKey = (place: string, theme: string | null) => `${place}|${theme ?? ""}`;

export type LiveView = {
  places: LivePlace[];
  total: number;
  /** The channels already there, by branch: every branch of a small tree, else the one a link opens. */
  loaded: Map<string, LiveChannel[]>;
};

/** The tree a search leaves: small enough, with all its channels; else folded, but for the branch `open` names. */
export async function liveView(ex: Exec, where: SQL | null, open: string): Promise<LiveView> {
  const places = await liveTree(where, ex);
  const total = places.reduce((n, p) => n + p.channels, 0);
  const loaded = new Map<string, LiveChannel[]>();
  if (total > 0 && total <= UNFOLDED_MAX) {
    for (const ch of await liveChannels(where, { offset: 0, limit: UNFOLDED_MAX }, ex)) {
      const key = branchKey(placeKey(ch.country, ch.market), ch.theme);
      loaded.set(key, [...(loaded.get(key) ?? []), ch]);
    }
    return { places, total, loaded };
  }
  const branch = branchOf(open);
  if (branch && places.some((p) => p.place === branch.place && p.themes.some((t) => t.theme === branch.theme)))
    loaded.set(branchKey(branch.place, branch.theme), await liveChannels(where, { ...branch, offset: 0, limit: LIVE_PAGE + 1 }, ex));
  return { places, total, loaded };
}
