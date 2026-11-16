import { z } from "zod";
import { cleanText, readNames } from "./read";

/**
 * Claude reads the live entries no reference channel was found for: a channel under a spelling or a
 * technical label of the provider's (« BEIN SPORTS 1 Gᵁᴴᴰ », « TNT AL OULA », « 2M NATIOANL LQ »), or
 * something that is no channel at all (the feed of one match, a pay-per-view slot, a loop of one show).
 * It is given the names the reference holds in the market and answers with one of them, or with the
 * channel's usual name, never with an id (it would make one up): the catalogue then looks that name
 * up in its reference, and only a channel found there counts.
 */

/** One live entry as the provider names it, with the category it sits in and the market it is listed under. */
export type ChannelQuery = { id: number; name: string; category: string | null; market: string | null };
export type ChannelSuggestion = {
  id: number;
  /** A TV channel, the feed of an event, or anything else (a radio, a loop of one programme, a test card). */
  kind: "channel" | "event" | "other";
  /** The channel's usual name (« beIN Sports 1 », « 2M », « Al Aoula »); null unless `kind` is `channel` and the model can tell. */
  name: string | null;
};

const Answer = z.object({
  entries: z.array(z.object({ id: z.number().int(), kind: z.enum(["channel", "event", "other"]), name: z.string().nullable() })),
});

const SYSTEM = `You identify TV channels from the raw entry names of an IPTV provider's live list, so that they can be matched to a reference list of channels. A prefix gives the market or country (|FR|, |AR|, "MA - ", "FR - "); the name is followed by the provider's technical labels: quality (SD, HD, FHD, UHD, 4K, 8K, LQ, HQ, 720), codec (HEVC, H265, RAW), a series letter of the provider's (G, NX), a time shift (+6H), a transmission (TNT, SAT), a backup or VIP mark.

For each entry, answer:
- kind: "channel" for a linear TV channel that exists under a name of its own (a national, thematic, sports, news, kids or regional channel, including its numbered sister channels such as "beIN Sports 3" or "Canal+ Sport 360"); "event" for a feed that only carries one event or a rotating slot (a match, a fight night, a pay-per-view, numbered event channels such as "DAZN PPV 12" or "LIGUE 1+ 7", entries naming teams, a date or a kick-off time, "NO EVENT"); "other" for anything else (a radio, a 24/7 loop of one series or one film franchise, a catch-up or streaming-platform shelf, a test or information card).
- name: for a channel, the name it bears in the reference list below, copied exactly, when the list holds it ("2M" for "2M MAROC NATIONAL", "Automoto la chaine" for "AUTOMOTO", "National Geographic Wild" for "NAT GEO WILD"). When the list does not hold it, its usual name as a TV guide would print it, without the provider's prefix and technical labels ("beIN Sports Max 4" for "BEIN MAX 4 FHD"). Keep what makes it another channel (a number, "Xtra", "Max", "News", a language edition such as "English" or "France", a region): never answer a sister channel. null when you cannot tell which channel it is, and for kinds other than "channel".

Use the category and the market as hints. Never pick a channel you are not reasonably sure of: null is the right answer when unsure. Return one entry per id given, with the same ids.`;

const line = (q: ChannelQuery) =>
  `#${q.id}${q.market ? ` · market ${q.market}` : ""}${q.category ? ` · category « ${q.category} »` : ""}\n${q.name}`;

/**
 * What the model sees in these entries of one market, given the names its reference holds there; an
 * entry it did not answer is missing from the result. Null without a key.
 */
export async function suggestChannels(queries: ChannelQuery[], reference: string[]): Promise<ChannelSuggestion[] | null> {
  const system = `${SYSTEM}\n\nReference list of this market, one channel per line:\n${reference.join("\n")}`;
  const entries = await readNames(queries, system, Answer, line);
  return entries?.map((e) => ({ id: e.id, kind: e.kind, name: e.kind === "channel" ? cleanText(e.name) : null })) ?? null;
}
