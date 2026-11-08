import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, hiddenItem, type ProviderAccount } from "@/db";
import {
  ACCOUNT,
  resetDb,
  closeDb,
  seedAccount,
  seedCategories,
  seedItems,
  seedTmdb,
  groupAndFilter,
  testLanguageOrder,
  testProfile,
} from "@/test/db";
import { accountsById, deleteAccount, moveAccount, setAccountEnabled } from "@/config";
import { runNaming } from "@/catalog";
import type { RestContext } from "../context";
import { variantsOf } from "../contents";
import { versionsOf } from "../versions";

/**
 * Two providers: the same film at both, under the same provider id, is one content with two sources
 * in the preferred account's order; a disabled account hides its variants; a deleted one takes them away.
 */
let backup: ProviderAccount;
const device = { id: 1, code: "ABCDEF" } as never;
const ctx = async (): Promise<RestContext> => ({
  baseUrl: "http://x",
  device,
  profile: testProfile,
  languageOrder: testLanguageOrder,
  tmdbLang: "fr-FR",
  accounts: await accountsById(),
  serveAdult: false,
});
const matrix = async () => {
  const [c] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.tmdbId, 603));
  return c;
};
const sources = async () => {
  const c = await ctx();
  const { playables } = await variantsOf(c, await matrix());
  return versionsOf(c, playables).flatMap((v) => v.sources.map((s) => `${v.id} ${s.provider.name} ${s.stream_url}`));
};

beforeAll(async () => {
  await resetDb();
  backup = await seedAccount({ name: "Backup" });
  await seedTmdb("movie", 603, { title: "Matrix", release_date: "1999-03-31" });
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K" },
    { accountId: backup.id, kind: "vod", xtreamId: "10", name: "|FR| FILMS" },
  ]);
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix (1999) 4K", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { accountId: backup.id, kind: "vod", xtreamId: "1", name: "|FR| Matrix (1999) 4K", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { accountId: backup.id, kind: "vod", xtreamId: "2", name: "|FR| Matrix (1999)", cat: "10", tmdbId: 603, matchStatus: "matched" },
  ]);
  await runNaming();
  await groupAndFilter();
});
afterAll(closeDb);

describe("provider accounts", () => {
  it("keeps the same provider id apart per account, under one content", async () => {
    const variants = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "1"));
    expect(variants.map((v) => v.accountId).sort()).toEqual([ACCOUNT, backup.id]);
    expect(new Set(variants.map((v) => v.contentId)).size).toBe(1);
    expect((await matrix()).variantCount).toBe(3);
  });

  it("lists one source per account in a version, the preferred account first, each on its own URL", async () => {
    expect(await sources()).toEqual([
      "vf-4k provider.test http://provider.test/movie/u/p/1.mkv",
      "vf-4k Backup http://backup.test/movie/u2/p2/1.mkv",
      "vf-hd Backup http://backup.test/movie/u2/p2/2.mkv",
    ]);
    await moveAccount(backup.id, "up");
    expect((await sources())[0]).toBe("vf-4k Backup http://backup.test/movie/u2/p2/1.mkv");
    await moveAccount(backup.id, "down");
  });

  it("hides the variants of a disabled account, and shows them again once enabled", async () => {
    await setAccountEnabled(backup.id, false);
    const hidden = await db.select({ id: schema.catalogVariants.id }).from(schema.catalogVariants).where(hiddenItem);
    expect(hidden).toHaveLength(2);
    await groupAndFilter();
    expect((await matrix()).variantCount).toBe(1);
    expect(await sources()).toEqual(["vf-4k provider.test http://provider.test/movie/u/p/1.mkv"]);
    await setAccountEnabled(backup.id, true);
    await groupAndFilter();
    expect((await matrix()).variantCount).toBe(3);
  });

  it("takes everything an account brought away with it", async () => {
    await deleteAccount(backup.id);
    expect(await db.select().from(schema.catalogVariants)).toHaveLength(1);
    expect(await db.select().from(schema.catalogCategories)).toHaveLength(1);
    await groupAndFilter();
    expect((await matrix()).variantCount).toBe(1);
  });
});
