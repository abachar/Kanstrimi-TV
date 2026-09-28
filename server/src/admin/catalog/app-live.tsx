import type { ChannelGroupWire, ChannelWire, Version } from "@/player";
import { fmt } from "../format";
import { Badge, Empty, Table } from "../ui";
import { Icon } from "../icons";

/**
 * « Application » view of the live kind: the channel groups (market · theme) exactly as
 * `/player/channels` serves them, read through the same function with a device-less context.
 * Read-only: a channel is corrected from its entry, reached through the search.
 */

/** « FHD · VF · 2 sources » */
function versionsSummary(versions: Version[]): string {
  if (!versions.length) return "aucune version";
  const qualities = [...new Set(versions.map((v) => v.quality))];
  const languages = [...new Set(versions.map((v) => v.language))];
  const sources = versions.reduce((n, v) => n + v.sources.length, 0);
  return [...qualities, ...languages, `${sources} source${sources > 1 ? "s" : ""}`].join(" · ");
}

const ChannelRow = ({ ch }: { ch: ChannelWire }) => (
  <tr>
    <td class="text-end text-muted-foreground tabular-nums">{ch.number ?? ""}</td>
    <td>{ch.logo ? <img src={ch.logo} alt="" width="32" height="32" class="size-8 object-contain" loading="lazy" /> : ""}</td>
    <td>
      <span class="inline-flex items-center gap-1">
        {ch.is_favorite ? (
          <span title="Favori" class="text-amber-400">
            <Icon name="favorites" cls="size-3.5 fill-current" />
          </span>
        ) : (
          ""
        )}
        <a
          class="font-medium hover:underline"
          href={`/admin/catalog?kind=live&vis=all&q=${encodeURIComponent(ch.name)}`}
          title="Retrouver les entrées"
        >
          {ch.name}
        </a>
      </span>
    </td>
    <td>{ch.max_quality && <Badge tone="muted">{ch.max_quality}</Badge>}</td>
    <td class="text-xs text-muted-foreground">{versionsSummary(ch.versions)}</td>
    <td>{ch.has_epg ? <Badge tone="info">EPG</Badge> : <span class="text-muted-foreground">—</span>}</td>
  </tr>
);

export function AppLiveView({ groups }: { groups: ChannelGroupWire[] }) {
  const total = groups.reduce((n, g) => n + g.channels.length, 0);
  return (
    <>
      <p class="text-sm text-muted-foreground">
        Lecture seule : les {fmt(groups.length)} groupes et {fmt(total)} chaînes que l'app reçoit (contenus visibles, adultes selon le
        réglage). Cliquer une chaîne retrouve ses entrées pour les corriger.
      </p>
      {groups.length === 0 && <Empty title="Aucun groupe" sub="Aucune chaîne visible pour l'app." />}
      {groups.length > 0 && (
        <div class="flex flex-col divide-y overflow-hidden rounded-xl border" id="live-groups">
          {/* `name` makes the groups exclusive: opening one closes the other, as the former accordion did. */}
          {groups.map((g) => (
            <details id={`grp-${g.id}`} name="live-groups">
              <summary class="flex h-12 w-full min-w-0 items-center gap-2 bg-muted/30 px-4 text-sm hover:bg-muted/50">
                <span class="truncate font-medium">{g.name}</span>
                <Badge tone="plain">{fmt(g.channels.length)}</Badge>
              </summary>
              <div class="border-t px-2">
                <Table>
                  <thead>
                    <tr>
                      <th class="text-end">N°</th>
                      <th></th>
                      <th>Chaîne</th>
                      <th>Qualité</th>
                      <th>Versions</th>
                      <th>EPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.channels.map((ch) => (
                      <ChannelRow ch={ch} />
                    ))}
                  </tbody>
                </Table>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
