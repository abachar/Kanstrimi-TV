import { Hono, type Context } from "hono";
import {
  attachName,
  ChannelError,
  type ChannelInput,
  createChannel,
  deleteChannel,
  itemById,
  nameCandidates,
  referenceChannelById,
  unmatchedVariants,
  updateChannel,
} from "@/catalog";
import { back, form, intParam } from "../http";
import { contentLink } from "../content/links";
import { NamePanel } from "./view";

/**
 * `/admin/channels`: what the Live screen and a channel's page do to the reference of the channels.
 * No page of its own: a name is attached and a channel created from the list of names left (Live),
 * a channel is edited on its own page; each form says where it came from and goes back there.
 */
export const channelsRoutes = new Hono();

const LIVE = "/admin/catalog?kind=live";
/** A slot of the page a panel is swapped into: an element id, nothing else. */
const SLOT = /^[a-z][a-z0-9-]{0,40}$/;

/**
 * Where a form leads back. From a channel's page (`item`, one of its variants): the page that
 * variant now belongs to, a renamed channel being another content. From the Live screen (`back`):
 * that screen as it was, and nowhere else, since it lands in a redirect.
 */
async function origin(f: Record<string, string | undefined>): Promise<string> {
  if (f.item && /^[1-9]\d{0,9}$/.test(f.item)) {
    const it = await itemById(Number(f.item));
    if (it) return contentLink(it.contentId, it.id);
  }
  return f.back?.startsWith(`${LIVE}&`) ? f.back : LIVE;
}

/** The form of a channel as the domain takes it: « auto » and « none » are the two ways to name no country. */
const inputOf = (f: Record<string, string>): ChannelInput => ({
  name: f.name ?? "",
  market: f.market ?? "",
  country: !f.country || f.country === "auto" ? null : f.country === "none" ? "" : f.country,
  theme: f.theme || null,
  aliases: (f.aliases ?? "").split(/\r?\n/),
  iptvId: f.iptv_id || null,
});

/** A refusal of the domain goes back to the form as a message; anything else is an error of ours. */
async function attempt(c: Context, f: Record<string, string>, fn: () => Promise<string>) {
  try {
    const ok = await fn();
    return back(c, await origin(f), { ok });
  } catch (e) {
    if (e instanceof ChannelError) return back(c, await origin(f), { err: e.message });
    throw e;
  }
}

/**
 * htmx: what a name left without a channel can become, swapped under its line (Live) or into the
 * channel's page: the closest channels, a search in every country, a new channel under that name.
 */
channelsRoutes.get("/panel", async (c) => {
  const { market = "", title = "", slot = "", back: from, item } = c.req.query();
  if (!SLOT.test(slot)) return c.notFound();
  const q = c.req.query("q")?.trim() ?? "";
  const [variants, candidates] = await Promise.all([unmatchedVariants(market, title), nameCandidates(market, title, q)]);
  return c.html(
    <NamePanel market={market} title={title} q={q} slot={slot} back={from} item={item} variants={variants} candidates={candidates} />,
  );
});
/** htmx: closes the panel, the slot is empty again. */
channelsRoutes.get("/panel/close", (c) => c.body(""));

channelsRoutes.post("/attach", async (c) => {
  const f = await form(c);
  return attempt(c, f, async () => `« ${f.title} » rattaché à ${await attachName(f.market ?? "", f.title ?? "", f.ref ?? "")}`);
});

channelsRoutes.post("/", async (c) => {
  const f = await form(c);
  const input = inputOf(f);
  return attempt(c, f, async () => {
    await createChannel(input);
    return `${input.name.trim()} enregistrée`;
  });
});

channelsRoutes.post("/:id{\\d+}", async (c) => {
  const id = intParam(c, "id");
  const f = await form(c);
  return attempt(c, f, async () => {
    await updateChannel(id, inputOf(f));
    return "Chaîne enregistrée";
  });
});

channelsRoutes.post("/:id{\\d+}/delete", async (c) => {
  const id = intParam(c, "id");
  const f = await form(c);
  if (!(await referenceChannelById(id))) return c.notFound();
  await deleteChannel(id);
  return back(c, await origin(f), { ok: "Précisions retirées : la chaîne est de nouveau lue telle qu'iptv-org la connaît" });
});
