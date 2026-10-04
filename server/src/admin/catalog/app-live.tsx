import type { ChannelGroupWire, ChannelWire, Version } from "@/player";
import { fmt } from "../format";
import { Badge, Empty, Table } from "../ui";
import { Icon } from "../icons";
import { contentKeyLink } from "../content/links";
import { SUMMARY } from "./row";

/**
 * « Catalogue » view of the live kind: the channel groups (country · theme) exactly as
 * `/player/channels` serves them, read through the same function with a device-less context,
 * one heading per country. Read-only: a channel opens its page, where its entries are corrected.
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
        <a class="font-medium hover:underline" href={contentKeyLink(ch.id)} title="Ouvrir la chaîne et ses variantes">
          {ch.name}
        </a>
      </span>
    </td>
    <td>{ch.max_quality && <Badge tone="muted">{ch.max_quality}</Badge>}</td>
    <td class="text-xs text-muted-foreground">{versionsSummary(ch.versions)}</td>
    <td>{ch.has_epg ? <Badge tone="info">EPG</Badge> : <span class="text-muted-foreground">—</span>}</td>
  </tr>
);

/** The groups under their country, in the server's order. */
function sections(groups: ChannelGroupWire[]): [string, ChannelGroupWire[]][] {
  const out = new Map<string, ChannelGroupWire[]>();
  for (const g of groups) out.set(g.section, [...(out.get(g.section) ?? []), g]);
  return [...out];
}

export function AppLiveView({ groups }: { groups: ChannelGroupWire[] }) {
  const total = groups.reduce((n, g) => n + g.channels.length, 0);
  return (
    <>
      <p class="text-sm text-muted-foreground">
        Lecture seule : les {fmt(groups.length)} groupes et {fmt(total)} chaînes que l'app reçoit (contenus visibles, adultes selon le
        réglage). Cliquer une chaîne ouvre sa fiche et ses variantes.
      </p>
      {groups.length === 0 && <Empty title="Aucun groupe" sub="Aucune chaîne visible pour l'app." />}
      {groups.length > 0 && (
        <div class="flex flex-col divide-y overflow-hidden rounded-xl border" id="live-groups">
          {/* `name` makes the groups exclusive: opening one closes the other, as the former accordion did. */}
          {sections(groups).map(([section, gs]) => (
            <>
              <h2 class="bg-muted/60 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section}</h2>
              {gs.map((g) => (
                <details id={`grp-${g.id}`} name="live-groups">
                  <summary class={SUMMARY}>
                    <span class="truncate font-medium">{g.theme}</span>
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
            </>
          ))}
        </div>
      )}
    </>
  );
}
