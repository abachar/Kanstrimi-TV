import type { Content } from "@/db";
import type { EpisodeLine } from "./data";
import { fmt } from "../format";
import { Icon } from "../icons";
import { Badge, Card, Empty } from "../ui";

/** Where the page comes back to after an episode's button. */
export const episodeAnchor = (e: { season: number; number: number }) => `e${e.season}-${e.number}`;

/** An episode: its number and title, what the app recorded of it, and the button that marks it seen or not. */
function Line({ c, e }: { c: Content; e: EpisodeLine }) {
  const seen = Boolean(e.progress?.finished);
  const percent = e.progress && !seen && e.progress.duration > 0 ? Math.round((e.progress.position / e.progress.duration) * 100) : 0;
  return (
    <li id={episodeAnchor(e)} class="flex scroll-mt-20 items-center gap-3 py-2">
      <span class="w-10 shrink-0 text-sm text-muted-foreground tabular-nums">É{e.number}</span>
      <span class="min-w-0 flex-1 truncate">{e.title ?? `Épisode ${e.number}`}</span>
      {seen ? <Badge tone="ok">Vu</Badge> : percent > 0 && <Badge tone="info">{percent} %</Badge>}
      <form method="post" action={`/admin/content/${c.id}/watched`}>
        <input type="hidden" name="episode" value={e.key} />
        {!seen && <input type="hidden" name="on" value="1" />}
        <button
          class="btn"
          data-variant="ghost"
          data-size="sm"
          title={seen ? "Retirer de mes vus" : "Marquer comme vu"}
          aria-label={`${seen ? "Retirer de mes vus" : "Marquer comme vu"} : S${e.season} É${e.number}`}
        >
          <Icon name={seen ? "x" : "success"} />
          <span class="max-sm:hidden">{seen ? "Retirer de mes vus" : "Marquer comme vu"}</span>
        </button>
      </form>
    </li>
  );
}

/** A series' episodes as the base holds them, season by season, each marked seen or not on its own. */
export function EpisodesCard({ c, episodes }: { c: Content; episodes: EpisodeLine[] }) {
  const seasons = [...new Set(episodes.map((e) => e.season))];
  const seen = episodes.filter((e) => e.progress?.finished).length;
  return (
    <Card title="Épisodes" icon="programmes" extra={episodes.length ? `${fmt(seen)} / ${fmt(episodes.length)} vus` : undefined}>
      {episodes.length === 0 ? (
        <Empty title="Aucun épisode en base" sub="Ils se construisent quand l'app ouvre la série, ou par « Marquer comme vu »." />
      ) : (
        <div class="flex flex-col gap-4">
          {seasons.map((s) => (
            <section class="flex flex-col">
              <h3 class="text-sm font-medium text-muted-foreground">Saison {s}</h3>
              <ul class="flex flex-col divide-y">
                {episodes
                  .filter((e) => e.season === s)
                  .map((e) => (
                    <Line c={c} e={e} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
