import { describe, it, expect } from "vitest";
import { parseXmltv, parseXmltvTime } from "../epg";

const XML = `<?xml version="1.0" encoding="utf-8" ?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv generator-info-name="x">
<channel id="TF1.fr"><display-name>|FR| TF1 HD</display-name></channel>
<channel id="Rai1.it"><display-name>|IT| RAI 1</display-name></channel>
<programme start="20260928200000 +0200" stop="20260928213000 +0200" channel="TF1.fr"><title lang="fr">Journal &amp; météo</title><desc lang="fr">Les titres</desc><title lang="en">News</title></programme>
<programme start="20260928213000 +0200" stop="20260928233000 +0200" channel="TF1.fr"><title>Film du soir</title></programme>
<programme start="20260928200000 +0200" stop="20260928210000 +0200" channel="Rai1.it"><title>Telegiornale</title></programme>
<programme start="garbage" stop="20260928210000 +0200" channel="TF1.fr"><title>Cassé</title></programme>
<programme start="20260928230000 +0200" stop="20260928230000 +0200" channel="TF1.fr"><title>Vide</title></programme>
</tv>`;

/** The XML cut into chunks of an awkward size, so tags and entities straddle boundaries. */
async function* chunks(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe("XMLTV", () => {
  it("parses times with their offset into UTC", () => {
    expect(parseXmltvTime("20260928200000 +0200")?.toISOString()).toBe("2026-09-28T18:00:00.000Z");
    expect(parseXmltvTime("20260928200000 -0530")?.toISOString()).toBe("2026-09-29T01:30:00.000Z");
    expect(parseXmltvTime("20260928200000")?.toISOString()).toBe("2026-09-28T20:00:00.000Z");
    expect(parseXmltvTime("2026-09-28")).toBeNull();
  });

  it("keeps only wanted channels, the first title and desc, and skips broken programmes", async () => {
    for (const size of [7, 64, 100_000]) {
      const rows = [];
      for await (const batch of parseXmltv(chunks(XML, size), new Set(["TF1.fr"]))) rows.push(...batch);
      expect(rows.map((r) => [r.channelId, r.title, r.overview, r.startAt.toISOString(), r.endAt.toISOString()])).toEqual([
        ["TF1.fr", "Journal & météo", "Les titres", "2026-09-28T18:00:00.000Z", "2026-09-28T19:30:00.000Z"],
        ["TF1.fr", "Film du soir", null, "2026-09-28T19:30:00.000Z", "2026-09-28T21:30:00.000Z"],
      ]);
    }
  });

  it("refuses malformed XML", async () => {
    const rows = [];
    await expect(async () => {
      for await (const b of parseXmltv(chunks("<tv><programme channel='x'", 5), new Set(["x"]))) rows.push(...b);
    }).rejects.toThrow();
  });
});
