import { eq, inArray } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { listProfiles, parseKey } from "@/catalog";
import { gridCard, listProgress, mostPlayedKeys, playsOf, type Card, type Progress, type RestContext } from "@/player";

/** One line of « Historique »: a progress row, resolved to a movie or to an episode of a series. */
export type HistoryRow = {
  key: string;
  progress: Progress;
  profileName: string;
  /** The movie, or the series of the episode; null when the key points nowhere any more. */
  content: Content | null;
  card: Card | null;
  /** « Série · S1 É3 · titre » for an episode, the movie title otherwise, the raw key when orphaned. */
  label: string;
  percent: number;
  /** How many times the profile played it (`app_plays`), 0 for a position set by hand. */
  plays: number;
};

/** One line of « Les plus regardés »: a movie or a series, its plays summed over its episodes. */
export type MostPlayedRow = { key: string; profileName: string; content: Content | null; card: Card | null; plays: number; lastAt: Date };

/** Every profile's most played titles (`mostPlayedKeys`), the most played first. */
export async function mostPlayedRows(ctx: RestContext): Promise<MostPlayedRow[]> {
  const profiles = await listProfiles();
  const rows = (
    await Promise.all(profiles.map(async (p) => (await mostPlayedKeys(p.id)).map((r) => ({ ...r, profileName: p.name }))))
  ).flat();
  const keys = [...new Set(rows.map((r) => r.key))];
  const contents = keys.length ? await db.select().from(schema.catalogContents).where(inArray(schema.catalogContents.key, keys)) : [];
  const byKey = new Map(contents.map((c) => [c.key, c]));
  return rows
    .map((r) => {
      const content = byKey.get(r.key) ?? null;
      return {
        key: r.key,
        profileName: r.profileName,
        content,
        card: content ? gridCard(ctx, content) : null,
        plays: r.plays,
        lastAt: r.lastAt,
      };
    })
    .sort((a, b) => b.plays - a.plays || b.lastAt.getTime() - a.lastAt.getTime());
}

/** Every progress row joined to what it points at, most recent first; orphans keep their raw key. */
export async function historyRows(ctx: RestContext): Promise<{ ongoing: HistoryRow[]; finished: HistoryRow[] }> {
  const [progress, plays] = await Promise.all([listProgress(), playsOf()]);
  const names = new Map((await listProfiles()).map((p) => [p.id, p.name]));
  const episodeKeys = progress.map((p) => p.contentKey).filter((k) => parseKey(k)?.episode !== undefined);
  const movieKeys = progress.map((p) => p.contentKey).filter((k) => !episodeKeys.includes(k));
  const [movies, episodes] = await Promise.all([
    movieKeys.length ? db.select().from(schema.catalogContents).where(inArray(schema.catalogContents.key, movieKeys)) : [],
    episodeKeys.length
      ? db
          .select({ episode: schema.catalogEpisodes, series: schema.catalogContents })
          .from(schema.catalogEpisodes)
          .innerJoin(schema.catalogContents, eq(schema.catalogContents.id, schema.catalogEpisodes.contentId))
          .where(inArray(schema.catalogEpisodes.key, episodeKeys))
      : [],
  ]);
  const movieByKey = new Map(movies.map((c) => [c.key, c]));
  const episodeByKey = new Map(episodes.map((e) => [e.episode.key, e]));

  const rows = progress.map((p): HistoryRow => {
    const key = p.contentKey;
    const ep = episodeByKey.get(key);
    const content = ep?.series ?? movieByKey.get(key) ?? null;
    const label = ep
      ? `${ep.series.title} · S${ep.episode.season} É${ep.episode.number}${ep.episode.title ? ` · ${ep.episode.title}` : ""}`
      : (content?.title ?? key);
    return {
      key,
      progress: p,
      profileName: names.get(p.profileId) ?? `profil ${p.profileId}`,
      content,
      card: content ? gridCard(ctx, content, p) : null,
      label,
      percent: p.duration > 0 ? Math.min(100, Math.round((p.position / p.duration) * 100)) : 0,
      plays: plays.get(`${p.profileId}:${key}`)?.plays ?? 0,
    };
  });
  return { ongoing: rows.filter((r) => !r.progress.finished), finished: rows.filter((r) => r.progress.finished) };
}
