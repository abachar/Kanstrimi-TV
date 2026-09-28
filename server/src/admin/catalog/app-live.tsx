import type { ChannelGroupWire, ChannelWire, Version } from "@/player";
import { fmt } from "../format";

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
    <td class="text-secondary text-end">{ch.number ?? ""}</td>
    <td>{ch.logo ? <img src={ch.logo} alt="" width="32" height="32" class="object-fit-contain" loading="lazy" /> : ""}</td>
    <td>
      {ch.is_favorite ? <span title="Favori">★ </span> : ""}
      <a
        class="link-body-emphasis text-decoration-none"
        href={`/admin/catalog?kind=live&vis=all&q=${encodeURIComponent(ch.name)}`}
        title="Retrouver les entrées"
      >
        {ch.name}
      </a>
    </td>
    <td>{ch.max_quality && <span class="badge text-bg-dark">{ch.max_quality}</span>}</td>
    <td class="small text-secondary">{versionsSummary(ch.versions)}</td>
    <td class="small">{ch.has_epg ? "EPG" : <span class="text-secondary">—</span>}</td>
  </tr>
);

export function AppLiveView({ groups }: { groups: ChannelGroupWire[] }) {
  const total = groups.reduce((n, g) => n + g.channels.length, 0);
  return (
    <>
      <p class="text-secondary small">
        Lecture seule : les {fmt(groups.length)} groupes et {fmt(total)} chaînes que l'app reçoit (contenus visibles, adultes selon le
        réglage). Cliquer une chaîne retrouve ses entrées pour les corriger.
      </p>
      {groups.length === 0 && <p class="text-secondary">Aucun groupe : aucune chaîne visible pour l'app.</p>}
      <div class="accordion" id="live-groups">
        {groups.map((g) => (
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target={`#grp-${g.id}`}
                aria-expanded="false"
                aria-controls={`grp-${g.id}`}
              >
                {g.name}
                <span class="badge text-bg-secondary ms-2">{fmt(g.channels.length)}</span>
              </button>
            </h2>
            <div id={`grp-${g.id}`} class="accordion-collapse collapse" data-bs-parent="#live-groups">
              <div class="accordion-body p-0">
                <table class="table table-sm table-hover align-middle mb-0">
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
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
