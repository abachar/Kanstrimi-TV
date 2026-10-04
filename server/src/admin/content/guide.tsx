import type { Content } from "@/db";
import type { ChannelGuide, GuideCandidate, GuideLine, VariantGuide } from "./data";
import { fmt, hhmm } from "../format";
import { Badge, Card, Empty } from "../ui";

const ORIGINS: Record<GuideCandidate["origin"], string> = {
  provider: "fournisseur",
  iptv: "iptv-org, le fournisseur nomme une autre chaîne",
  fallback: "source de secours",
};

const day = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const when = (d: Date) => `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} ${hhmm(d)}`;
const correction = (id: string) => `/admin/epg?channel=${encodeURIComponent(id)}`;

/** One id a variant tries: where it comes from, what the base holds under it, its time correction. */
const Candidate = ({ x, used }: { x: GuideCandidate; used: boolean }) => (
  <li class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <a href={correction(x.id)} class="font-mono text-xs hover:underline" title="Voir et corriger l'heure de ce guide">
      {x.id}
    </a>
    <span class="text-muted-foreground">{ORIGINS[x.origin]}</span>
    {x.programmes ? (
      <Badge tone={used ? "ok" : "muted"}>
        {fmt(x.programmes)} programmes jusqu'au {when(x.until!)}
      </Badge>
    ) : (
      <Badge tone="muted">aucun programme</Badge>
    )}
    {x.offsetMinutes !== 0 && (
      <Badge tone="info">
        {x.offsetMinutes > 0 ? "+" : ""}
        {x.offsetMinutes} min
      </Badge>
    )}
    {used && <Badge tone="ok">utilisé</Badge>}
  </li>
);

/** A variant and the ids it tries in the app's order; without a guide of its own, the app borrows another quality's. */
function VariantLine({ v, borrows }: { v: VariantGuide; borrows: boolean }) {
  const quality = [v.item.quality, v.item.dynamicRange].filter(Boolean).join(" · ");
  return (
    <li class="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <p class="flex flex-wrap items-center gap-2 font-medium">
        {v.item.name}
        {quality && <Badge tone="muted">{quality}</Badge>}
      </p>
      {v.candidates.length ? (
        <ol class="flex flex-col gap-1 text-sm">
          {v.candidates.map((x) => (
            <Candidate x={x} used={x.id === v.used} />
          ))}
        </ol>
      ) : (
        <p class="text-sm text-muted-foreground">Aucun identifiant EPG.</p>
      )}
      {!v.used && (
        <p class="text-sm text-amber-400">
          {borrows ? "Pas de guide propre : l'app prend celui d'une autre qualité." : "Pas de guide : l'app n'affiche aucun programme."}
        </p>
      )}
    </li>
  );
}

/** Every programme stored in the guide, day by day, the one on air marked, the aired ones greyed. */
function Programmes({ lines }: { lines: GuideLine[] }) {
  const now = new Date();
  const days = new Map<string, GuideLine[]>();
  for (const p of lines) days.set(day(p.startAt), [...(days.get(day(p.startAt)) ?? []), p]);
  return (
    <div class="flex max-h-[36rem] flex-col gap-4 overflow-y-auto pe-2">
      {[...days].map(([d, ps]) => (
        <section class="flex flex-col gap-1">
          <h3 class="sticky top-0 bg-card py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d}</h3>
          <ol class="flex flex-col text-sm">
            {ps.map((p) => {
              const onAir = p.startAt <= now && now < p.endAt;
              return (
                <li class={`flex gap-3 rounded px-2 py-1 ${onAir ? "bg-muted" : ""} ${p.endAt <= now ? "text-muted-foreground" : ""}`}>
                  <span class="shrink-0 text-muted-foreground tabular-nums">
                    {hhmm(p.startAt)}–{hhmm(p.endAt)}
                  </span>
                  <span class="min-w-0 break-words">
                    {p.title}
                    {onAir && (
                      <span class="ms-2 align-middle">
                        <Badge tone="bad">en ce moment</Badge>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * A channel's guide: how each variant finds it (the provider's id, iptv-org's, the fallback source),
 * then everything the base holds in the one the app shows first. Changes are made on the EPG pages.
 */
export function GuideCard({ c, g }: { c: Content; g: ChannelGuide }) {
  const anyGuide = g.variants.some((v) => v.used);
  const f = g.fallback;
  const sourceLink = f && `/admin/epg/sources/${f.sourceId}?${new URLSearchParams({ tab: "ours", show: "all", q: c.title })}`;
  return (
    <>
      <Card
        title="Rapprochement EPG"
        hint="Les identifiants que chaque variante essaie, dans l'ordre de l'app : le premier qui a des programmes donne son guide."
      >
        <div class="flex flex-col gap-4">
          <ul class="flex flex-col divide-y">
            {g.variants.map((v) => (
              <VariantLine v={v} borrows={anyGuide} />
            ))}
          </ul>
          <p class="text-sm text-muted-foreground">
            {f ? (
              <>
                Secours : <span class="text-foreground">{f.sourceName}</span>, chaîne <code class="font-mono text-xs">{f.channelId}</code>,
                rattachée {f.manual ? "à la main" : "par le nom"} ·{" "}
                <a href={sourceLink!} class="underline hover:text-foreground">
                  changer le lien
                </a>
              </>
            ) : (
              <>
                Aucune source de secours ·{" "}
                <a href="/admin/epg" class="underline hover:text-foreground">
                  sources EPG
                </a>
              </>
            )}
          </p>
        </div>
      </Card>
      <Card
        title="Programmes en base"
        hint={g.shown ? `Guide ${g.shown} · ${fmt(g.programmes.length)} programmes` : undefined}
        extra={
          g.shown && (
            <a href={correction(g.shown)} class="underline hover:text-foreground">
              Corriger l'heure
            </a>
          )
        }
      >
        {g.programmes.length ? (
          <Programmes lines={g.programmes} />
        ) : (
          <Empty title="Aucun programme" sub="Aucun guide de cette chaîne n'a de programme en base." />
        )}
      </Card>
    </>
  );
}
