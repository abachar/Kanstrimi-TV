import { describe, it, expect } from "vitest";
import type { RestContext } from "../context";
import { parseVariantId, variantId, variantLabel, wireVariants, type Playable } from "../variants";

const account = (id: number, name: string, position: number) =>
  [id, { id, name, position, url: `http://p${id}.test`, username: "u", password: "p" }] as const;
const ctx = {
  device: { id: 1 },
  languageOrder: { vod: ["VF", "VOSTFR", "VO"], series: ["VF", "VOSTFR", "VO"] },
  accounts: new Map([account(1, "Premier", 1), account(2, "Secours", 2)]),
} as unknown as RestContext;

let next = 0;
const row = (p: Partial<Playable> & { accountId?: number }): Playable => {
  const id = ++next;
  return {
    variantId: variantId("item", id),
    streamId: id,
    container: "MKV",
    upstream: { accountId: p.accountId ?? 1, kind: "movie", id: String(id), ext: "mkv" },
    lang: "VF",
    quality: "HD",
    dynamicRange: null,
    edition: null,
    epgIds: [],
    categoryName: "|FR| FILMS",
    name: `Film ${id}`,
    qualityRank: 0,
    position: id,
    id,
    ...p,
  };
};

describe("variants", () => {
  it("an id names a stream or an episode under one, and reads back", () => {
    expect(parseVariantId(variantId("item", 1295))).toEqual({ kind: "item", id: 1295 });
    expect(parseVariantId(variantId("episode", 7))).toEqual({ kind: "episode", id: 7 });
    expect(parseVariantId("vf-4k-dv")).toBeNull();
  });

  it("says its language, its quality and its cut in one text", () => {
    expect(variantLabel({ language: "VF", quality: "4K", dynamic_range: "DV" })).toBe("FR · 4K DV");
    expect(variantLabel({ language: "VOSTFR", quality: "HD", edition: "Version longue" })).toBe("VOSTF · HD · Version longue");
  });

  it("one per stream: the profile's languages, the usual cut first, the best quality, then the preferred provider", () => {
    const list = wireVariants(ctx, [
      row({ lang: "VO", quality: "4K", name: "vo" }),
      row({ quality: "HD", accountId: 2, name: "hd secours" }),
      row({ quality: "HD", name: "hd premier" }),
      row({ quality: "4K", dynamicRange: "DV", edition: "Version longue", name: "longue" }),
      row({ quality: "4K", dynamicRange: "HDR", name: "hdr" }),
      row({ quality: "4K", dynamicRange: "DV", name: "dv" }),
      row({ lang: null, quality: null, name: "muet" }),
    ]);
    expect(list.map((v) => v.name)).toEqual(["dv", "hdr", "hd premier", "hd secours", "longue", "vo", "muet"]);
    expect(list[0]).toMatchObject({
      language: "VF",
      quality: "4K",
      dynamic_range: "DV",
      badge: "4K DV",
      label: "FR · 4K DV",
      provider: { name: "Premier", rank: 1 },
      category: "|FR| FILMS",
      container: "MKV",
    });
    expect(list[0].stream_url).toMatch(/^http:\/\/p1\.test\/movie\/u\/p\/\d+\.mkv$/);
    // Nothing said of its language or its quality: VO, HD.
    expect(list[6]).toMatchObject({ language: "VO", quality: "HD", badge: "HD" });
  });

  it("a series' own variants name its streams and play nothing", () => {
    expect(wireVariants(ctx, [row({})], false)[0].stream_url).toBeNull();
  });
});
