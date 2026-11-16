import { type Candidate, type ContentChannel, REFERENCE_THEMES, REGIONS, type UnmatchedVariant } from "@/catalog";
import type { ReferenceChannel } from "@/db";
import { Card, Options } from "../ui";
import { Icon } from "../icons";

/**
 * The parts of the reference of the channels the Live screen and a channel's page share: a one-click
 * attachment, the panel of a name left without a channel, the fields of a channel of ours.
 */

const ROOT = "/admin/channels";
const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });
export const countryName = (code: string) => regionNames.of(code) ?? code;

/** Where the forms of a panel or a card go back to: the Live screen as it was, or the page of a variant's channel. */
type Origin = { back?: string; item?: string | number };
const OriginFields = ({ back, item }: Origin) => (
  <>
    {back && <input type="hidden" name="back" value={back} />}
    {item && <input type="hidden" name="item" value={String(item)} />}
  </>
);

/** One click attaches the name to this channel, for every provider. */
export function Attach({ market, title, c, ...origin }: { market: string; title: string; c: Candidate } & Origin) {
  return (
    <form method="post" action={`${ROOT}/attach`}>
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="ref" value={c.ref} />
      <OriginFields {...origin} />
      <button
        class="btn"
        data-variant="outline"
        data-size="sm"
        title={`Rattacher « ${title} » à ${c.name} (${c.ref.replace(/^(own|iptv):/, "")})`}
      >
        <Icon name="link" />
        {c.name}
        {c.country && <span class="text-muted-foreground">{c.country}</span>}
      </button>
    </form>
  );
}

/** Theme and country of a channel; the country only where the market is a region. */
function ThemeAndCountry({
  market,
  theme,
  country,
  id,
}: {
  market: string;
  theme: string | null;
  country: string | null | undefined;
  id: string;
}) {
  const region = REGIONS[market];
  const cur = country === null || country === undefined ? "auto" : country === "" ? "none" : country;
  return (
    <>
      <div class="field md:col-span-3">
        <label class="label" for={`${id}-theme`}>
          Thème
        </label>
        <select class="select" id={`${id}-theme`} name="theme">
          <Options opts={[["", "Automatique"], ...REFERENCE_THEMES.map((t) => [t, t] as const)]} cur={theme ?? ""} />
        </select>
      </div>
      {region && (
        <div class="field md:col-span-3">
          <label class="label" for={`${id}-country`}>
            Pays
          </label>
          <select class="select" id={`${id}-country`} name="country">
            <Options
              opts={[["auto", "Automatique"], ["none", "Toute la région"], ...region.map((c) => [c, countryName(c)] as const)]}
              cur={cur}
            />
          </select>
        </div>
      )}
    </>
  );
}

/**
 * What a name left without a channel can become, under its line or in its page: the closest channels
 * (with `q`, those of every country that hold these words), or a new channel under a name of ours.
 * The search swaps the panel in place; attaching and creating are plain forms.
 */
export function NamePanel({
  market,
  title,
  q,
  slot,
  variants,
  candidates,
  ...origin
}: { market: string; title: string; q: string; slot: string; variants: UnmatchedVariant[]; candidates: Candidate[] } & Origin) {
  return (
    <div class="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
      <form class="flex flex-wrap gap-2" role="search" hx-get={`${ROOT}/panel`} hx-target={`#${slot}`} hx-swap="innerHTML">
        <input type="hidden" name="market" value={market} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slot" value={slot} />
        <OriginFields {...origin} />
        <input
          class="input h-8 max-w-sm"
          type="search"
          name="q"
          value={q}
          placeholder="Chercher une chaîne : bein, national geographic…"
          aria-label="Chercher une chaîne"
        />
        <button class="btn" data-variant="outline" data-size="sm">
          <Icon name="search" />
          Chercher
        </button>
        {origin.back && (
          <button
            type="button"
            class="btn ms-auto"
            data-variant="ghost"
            data-size="sm"
            hx-get={`${ROOT}/panel/close`}
            hx-target={`#${slot}`}
            hx-swap="innerHTML"
          >
            <Icon name="x" />
            Fermer
          </button>
        )}
      </form>
      {candidates.length > 0 ? (
        <div class="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <Attach market={market} title={title} c={c} {...origin} />
          ))}
        </div>
      ) : (
        <p class="text-sm text-muted-foreground">
          {q ? `Aucune chaîne ne s'appelle « ${q} ».` : "Aucune chaîne proche : cherchez-la par son nom, ou créez-la."}
        </p>
      )}
      <form method="post" action={ROOT} class="grid grid-cols-1 items-end gap-3 md:grid-cols-12">
        <input type="hidden" name="market" value={market} />
        <input type="hidden" name="aliases" value={title} />
        <OriginFields {...origin} />
        <div class="field md:col-span-4">
          <label class="label" for={`${slot}-name`}>
            Ou une nouvelle chaîne, sous ce nom
          </label>
          <input class="input" id={`${slot}-name`} name="name" required maxlength={80} value={title} />
        </div>
        <ThemeAndCountry market={market} theme={null} country={null} id={slot} />
        <div class="md:col-span-2">
          <button class="btn" data-variant="outline">
            <Icon name="plus" />
            Créer
          </button>
        </div>
      </form>
      {variants.length > 0 && (
        <p class="text-xs text-muted-foreground">
          {variants.length} version{variants.length > 1 ? "s" : ""} :{" "}
          {variants.slice(0, 8).map((v, i) => (
            <>
              {i > 0 && " · "}
              <a href={`/admin/item/${v.id}`} class="hover:underline" title={`${v.provider}${v.category ? ` · ${v.category}` : ""}`}>
                {v.name}
              </a>
            </>
          ))}
          {variants.length > 8 && ` · +${variants.length - 8}`}
        </p>
      )}
    </div>
  );
}

/** The fields of a channel of ours: its name, what we say of it, the names the providers give it. */
function ChannelFields({
  ch,
  id,
}: {
  ch: Pick<ReferenceChannel, "name" | "market" | "theme" | "country" | "aliases" | "iptvId">;
  id: string;
}) {
  return (
    <>
      <input type="hidden" name="market" value={ch.market} />
      <input type="hidden" name="iptv_id" value={ch.iptvId ?? ""} />
      <div class="field md:col-span-6">
        <label class="label" for={`${id}-name`}>
          Nom
        </label>
        <input class="input" id={`${id}-name`} name="name" required maxlength={80} value={ch.name} />
      </div>
      <ThemeAndCountry market={ch.market} theme={ch.theme} country={ch.country} id={id} />
      <div class="field md:col-span-12">
        <label class="label" for={`${id}-aliases`}>
          Noms chez les fournisseurs, un par ligne
        </label>
        <textarea class="textarea font-mono" id={`${id}-aliases`} name="aliases" rows={Math.max(2, ch.aliases.length + 1)}>
          {ch.aliases.join("\n")}
        </textarea>
      </div>
    </>
  );
}

/**
 * A channel's page: what the channel is. Recognised: its name, its theme, its country and the names
 * the providers give it, to change here (what we say is kept in a row of ours; without one, iptv-org
 * alone speaks). Not recognised: the panel to attach its name.
 */
export function ChannelCard({ ch }: { ch: ContentChannel }) {
  if (!ch.market) return null;
  if (!ch.name)
    return (
      <Card
        title="Chaîne non rattachée"
        icon="link"
        hint={`« ${ch.title} » ne correspond à aucune chaîne connue : la rattacher une fois vaut pour tous les fournisseurs.`}
      >
        <div
          id="channel-panel"
          hx-get={`${ROOT}/panel?market=${encodeURIComponent(ch.market)}&title=${encodeURIComponent(ch.title)}&slot=channel-panel&item=${ch.variantId}`}
          hx-trigger="load"
        ></div>
      </Card>
    );
  const known = ch.iptv ? `iptv-org la connaît sous ${ch.iptv.id}` : "iptv-org ne la connaît pas : elle n'existe que chez nous";
  const fields = ch.own ?? { name: ch.name, market: ch.market, theme: null, country: null, aliases: [], iptvId: ch.iptv?.id ?? null };
  return (
    <Card
      title="Chaîne"
      icon="live"
      folded={!ch.own}
      hint={`${known}. ${ch.own ? "Nom, thème, pays et noms des fournisseurs sont les nôtres." : "Dépliez pour préciser son nom, son thème, son pays ou les noms que les fournisseurs lui donnent."}`}
    >
      <div class="flex flex-col gap-4">
        <form method="post" action={ch.own ? `${ROOT}/${ch.own.id}` : ROOT} class="grid grid-cols-1 gap-4 md:grid-cols-12">
          <input type="hidden" name="item" value={String(ch.variantId)} />
          <ChannelFields ch={fields} id="ch" />
          <div class="md:col-span-12">
            <button class="btn" data-variant="primary">
              <Icon name="save" />
              Enregistrer
            </button>
          </div>
        </form>
        {ch.own && (
          <form
            method="post"
            action={`${ROOT}/${ch.own.id}/delete`}
            hx-post={`${ROOT}/${ch.own.id}/delete`}
            hx-confirm={
              ch.iptv
                ? `Retirer nos précisions sur ${ch.own.name} ? La chaîne reste, telle qu'iptv-org la connaît.`
                : `Supprimer ${ch.own.name} ? Ses versions redeviennent non rattachées.`
            }
          >
            <input type="hidden" name="item" value={String(ch.variantId)} />
            <button class="btn" data-variant="ghost" data-size="sm">
              <Icon name="trash" />
              {ch.iptv ? "Retirer nos précisions" : "Supprimer la chaîne"}
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}
