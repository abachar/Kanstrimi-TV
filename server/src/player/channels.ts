import { Hono } from "hono";
import { channelContent, db, schema, variants, type Content } from "@/db";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { slug } from "@/shared";
import { LIVE_THEMES, parseKey, QUALITY_RANK } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { categoryNameOf, categoryNames, contentByKey, liveCategories, servedVariant, variantsOf, visibleChannel } from "./contents";
import { favoriteSet } from "./favorites";
import { MOST_WATCHED_LIMIT, mostWatchedKeys, RECENT_LIMIT, recentKeys } from "./watch-time";
import { rememberedOf, rememberedWire } from "./remembered";
import { languageLabel, playableOfItem, qualityOfRank, wireVariants, type Playable } from "./variants";
import { guidesOf } from "./guides";
import { dayProgrammes, epgOf, type ChannelEpg } from "./epg";
import { channelLogo } from "./cards";
import type { ProfileVariant } from "@/db";
import type { ChannelGroupWire, ChannelWire, Variant } from "./types";

/**
 * `/channels`: every visible live category with its channels; `/channels/{id}`: one channel;
 * `/channels/{id}/programmes?variant=`: its programmes until 6:00, for the live player, in the guide of
 * that variant (each quality may have its own), the channel's without one.
 */
export const channelRoutes = new Hono<Env>();

channelRoutes.get("/", async (c) => json(await channelGroups(c.get("ctx"))));
channelRoutes.get("/:id", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const content = await contentByKey(c.get("ctx"), key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  return json(await channelSheet(c.get("ctx"), content));
});
channelRoutes.get("/:id/programmes", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const ctx = c.get("ctx");
  const content = await contentByKey(ctx, key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  const playables = withFallback(content, (await variantsOf(ctx, content)).playables);
  const { variants: all, guides } = guided(ctx, playables, await epgOf(playables.flatMap((p) => p.epgIds)));
  const variant = c.req.query("variant");
  const id = (variant && guides.has(variant) ? guides.get(variant) : guides.get(all[0]?.id ?? "")) ?? null;
  return json(id ? await dayProgrammes(id) : []);
});

/**
 * A channel's fallback guide (a source completing the provider's, `catalog/epg-sources.ts`), tried by
 * every variant after the provider's own ids.
 */
function withFallback(c: Content, playables: Playable[]): Playable[] {
  const f = c.epgFallbackId;
  return f ? playables.map((p) => ({ ...p, epgIds: [...p.epgIds, f] })) : playables;
}

/** The variants of a channel and the guide of each (`guidesOf`), from the guides known to `epg`. */
function guided(ctx: RestContext, playables: Playable[], epg: Map<string, ChannelEpg>) {
  const all = wireVariants(ctx, playables);
  return { variants: all, guides: guidesOf(all, playables, (id) => epg.get(id)?.hasEpg ?? false) };
}

/** A live variant's chip: its quality, then its language (« FR » for VF) when the channel mixes languages. */
export function liveChip(v: Pick<Variant, "quality" | "language">, mixed: boolean): string {
  return mixed ? `${v.quality}/${languageLabel(v.language)}` : v.quality;
}

/** What the profile recorded of its channels: list, time watched, last watched, chosen variants. */
type ProfileMarks = {
  favs: Set<string>;
  watchedRank: Map<string, number>;
  recentRank: Map<string, number>;
  remembered: Map<string, ProfileVariant>;
};
async function profileMarks(ctx: RestContext, keys: string[]): Promise<ProfileMarks> {
  const [favs, watched, recent, remembered] = await Promise.all([
    favoriteSet(ctx.profile.id),
    mostWatchedKeys(ctx.profile.id),
    recentKeys(ctx.profile.id),
    rememberedOf(ctx.profile, keys),
  ]);
  const visible = new Set(keys);
  const rank = (list: string[], limit: number) =>
    new Map(
      list
        .filter((k) => visible.has(k))
        .slice(0, limit)
        .map((k, i) => [k, i + 1]),
    );
  return { favs, watchedRank: rank(watched, MOST_WATCHED_LIMIT), recentRank: rank(recent, RECENT_LIMIT), remembered };
}

/**
 * Lists and sheets alike carry `now` / `next`: the app rolls over on `end` without asking again. The
 * channel's guide is its first variant's; a variant whose guide differs carries its own.
 */
function channelWire(ctx: RestContext, c: Content, playables: Playable[], marks: ProfileMarks, epgs: Map<string, ChannelEpg>): ChannelWire {
  const { variants: all, guides } = guided(ctx, playables, epgs);
  const main = guides.get(all[0]?.id ?? "") ?? null;
  const epg = main ? epgs.get(main) : undefined;
  const mixed = new Set(all.map((v) => v.language)).size > 1;
  const list: Variant[] = all.map((v) => {
    const own = guides.get(v.id) ?? null;
    const labelled = { ...v, chip: liveChip(v, mixed) };
    if (own === main) return labelled;
    const e = own ? epgs.get(own) : undefined;
    return { ...labelled, has_epg: e?.hasEpg ?? false, now: e?.now ?? null, next: e?.next ?? null };
  });
  return {
    id: c.key,
    name: c.title,
    number: c.channelNumber,
    logo: channelLogo(ctx.baseUrl, c.logoUrl),
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    has_epg: epg?.hasEpg ?? false,
    is_favorite: marks.favs.has(c.key),
    variants: list,
    // The best quality first, whatever the language it comes in.
    chips: [...new Set([...list].sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]).map((v) => v.chip!))],
    now: epg?.now ?? null,
    next: epg?.next ?? null,
    ...(marks.watchedRank.has(c.key) ? { watched_rank: marks.watchedRank.get(c.key) } : {}),
    ...(marks.recentRank.has(c.key) ? { recent_rank: marks.recentRank.get(c.key) } : {}),
    ...(marks.remembered.has(c.key) ? { remembered: rememberedWire(marks.remembered.get(c.key), playables)! } : {}),
  };
}

/** French names of the markets the channels come from; the code itself otherwise. */
const MARKET_NAMES: Record<string, string> = {
  fr: "France",
  be: "Belgique",
  ch: "Suisse",
  ca: "Canada",
  lu: "Luxembourg",
  ma: "Maroc",
  dz: "Algérie",
  tn: "Tunisie",
  ar: "Monde arabe",
  eg: "Égypte",
  sa: "Arabie saoudite",
  ae: "Émirats arabes unis",
  qa: "Qatar",
  lb: "Liban",
  kw: "Koweït",
  bh: "Bahreïn",
  om: "Oman",
  jo: "Jordanie",
  iq: "Irak",
  sy: "Syrie",
  ly: "Libye",
  ye: "Yémen",
  ps: "Palestine",
  sd: "Soudan",
  mr: "Mauritanie",
  us: "États-Unis",
  uk: "Royaume-Uni",
  gb: "Royaume-Uni",
  ie: "Irlande",
  it: "Italie",
  es: "Espagne",
  pt: "Portugal",
  de: "Allemagne",
  nl: "Pays-Bas",
  tr: "Turquie",
  il: "Israël",
  in: "Inde",
  pk: "Pakistan",
  cn: "Chine",
  kr: "Corée",
  jp: "Japon",
  br: "Brésil",
  pl: "Pologne",
  ro: "Roumanie",
  gr: "Grèce",
  se: "Suède",
  no: "Norvège",
  dk: "Danemark",
  ru: "Russie",
  ua: "Ukraine",
  krd: "Kurdistan",
  af: "Afrique",
};
const marketName = (m: string | null) => (m ? (MARKET_NAMES[m] ?? m.toUpperCase()) : "International");
const countryNames = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });
/** The markets named above that are no country: their code is another's (AR is Argentina, AF Afghanistan). */
const REGION_MARKETS = new Set(["ar", "af", "krd"]);
const countryName = (code: string) =>
  (!REGION_MARKETS.has(code) && MARKET_NAMES[code]) || countryNames.of(code.toUpperCase()) || code.toUpperCase();
/**
 * Where a channel is shown: under its country, else under its market, a region (« Monde arabe »,
 * « Afrique »). A country's code may be a region's too (« ar » is the Arab world, AR Argentina), hence a
 * key of its own; `code` starts the group's id.
 */
function placeOf(c: Pick<Content, "country" | "market">): { key: string; code: string | null; country: boolean; name: string } {
  if (!c.country) return { key: `market:${c.market ?? ""}`, code: c.market, country: false, name: marketName(c.market) };
  const code = c.country.toLowerCase();
  return { key: `country:${code}`, code, country: true, name: countryName(code) };
}

/** The first group a channel sits in on the Direct screen, « France · Sport »: what a search result says of it. */
export function channelGroupName(c: Pick<Content, "country" | "market" | "themes">): string {
  return `${placeOf(c).name} · ${c.themes[0] ?? LIVE_THEMES[0]}`;
}
const themeRank = (t: string) => {
  const i = (LIVE_THEMES as readonly string[]).indexOf(t);
  return i === -1 ? LIVE_THEMES.length : i;
};

/**
 * One group per country × theme (« France · Sport »), the themes coming from the provider's own
 * separator lines and thematic categories. A channel has one theme, so it sits in one group.
 * A channel without a country is a region's: the pan-Arab ones stay under « Monde arabe ». Countries
 * with the most channels first; within one, the known themes in their order, then the provider's own
 * labels alphabetically.
 */
export async function channelGroups(ctx: RestContext): Promise<ChannelGroupWire[]> {
  const [channels, items] = await Promise.all([
    db
      .select(channelContent)
      .from(schema.catalogChannels)
      .where(visibleChannel(ctx))
      .orderBy(asc(schema.catalogChannels.number), asc(schema.catalogChannels.name), asc(schema.catalogChannels.id)),
    db
      .select()
      .from(variants)
      // On a channel: what the index of `channel_id` finds at once, before the stream says it is live.
      .where(and(isNotNull(variants.channelId), eq(variants.kind, "live"), servedVariant(ctx))),
  ]);
  const marks = await profileMarks(
    ctx,
    channels.map((c) => c.key),
  );
  const catName = categoryNames(await liveCategories());
  const byContent = new Map<number, Playable[]>();
  for (const it of items)
    byContent.set(it.contentId!, [...(byContent.get(it.contentId!) ?? []), playableOfItem(it, categoryNameOf(catName, it))]);
  const epg = await epgOf([
    ...[...byContent.values()].flat().flatMap((p) => p.epgIds),
    ...channels.flatMap((c) => (c.epgFallbackId ? [c.epgFallbackId] : [])),
  ]);

  type Group = { place: ReturnType<typeof placeOf>; theme: string; channels: ChannelWire[] };
  const groups = new Map<string, Group>();
  for (const c of channels) {
    const playables = withFallback(c, byContent.get(c.id) ?? []);
    if (!playables.length) continue;
    const wire = channelWire(ctx, c, playables, marks, epg);
    const place = placeOf(c);
    for (const theme of c.themes.length ? c.themes : [LIVE_THEMES[0]]) {
      const key = `${place.key}|${theme}`;
      const g = groups.get(key) ?? { place, theme, channels: [] };
      g.channels.push(wire);
      groups.set(key, g);
    }
  }
  const perPlace = new Map<string, number>();
  for (const g of groups.values()) perPlace.set(g.place.key, (perPlace.get(g.place.key) ?? 0) + g.channels.length);
  // A country whose code is also a region's shown here says it is the country.
  const regions = new Set([...groups.values()].filter((g) => !g.place.country).map((g) => g.place.code));
  const idOf = (p: Group["place"]) => (p.country && regions.has(p.code) ? `pays-${p.code}` : (p.code ?? "intl"));
  return [...groups.values()]
    .sort(
      (a, b) =>
        perPlace.get(b.place.key)! - perPlace.get(a.place.key)! ||
        (a.place.code ?? "").localeCompare(b.place.code ?? "") ||
        a.place.key.localeCompare(b.place.key) ||
        themeRank(a.theme) - themeRank(b.theme) ||
        a.theme.localeCompare(b.theme),
    )
    .map((g) => ({
      id: `${idOf(g.place)}-${slug(g.theme)}`,
      name: `${g.place.name} · ${g.theme}`,
      section: g.place.name,
      theme: g.theme,
      channels: g.channels,
    }));
}

export async function channelSheet(ctx: RestContext, content: Content): Promise<ChannelWire> {
  const [{ playables: own }, marks] = await Promise.all([variantsOf(ctx, content), profileMarks(ctx, [content.key])]);
  const playables = withFallback(content, own);
  return channelWire(ctx, content, playables, marks, await epgOf(playables.flatMap((p) => p.epgIds)));
}
