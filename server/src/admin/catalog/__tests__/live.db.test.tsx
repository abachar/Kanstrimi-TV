import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { compileQuery, runNaming } from "@/catalog";
import { resetDb, closeDb, seedItems, groupAndFilter, knowChannels, leaveUnknown } from "@/test/db";
import { branchOf, LIVE_PAGE, liveShortcuts, liveView } from "../live-data";
import { LiveTree } from "../app-live";

const NAMES = Array.from({ length: 70 }, (_, i) => `|FR| CHAINE ${String(i).padStart(2, "0")}`);

beforeAll(async () => {
  await resetDb();
  await seedItems([
    { kind: "live", upstreamId: "100", name: "|FR| TF1 HD", section: "|FR| GÉNÉRALISTES |FR|" },
    ...NAMES.map((name, i) => ({ kind: "live" as const, upstreamId: String(200 + i), name })),
  ]);
  await runNaming();
  await knowChannels();
  await leaveUnknown(NAMES);
  await groupAndFilter();
});
afterAll(closeDb);

const search = (q: string) => compileQuery(q, { kind: "live", lang: "fr-FR" });
const LEFT = "fr|Non reconnus";

describe("the Live screen's tree", () => {
  it("stays folded while it is large: counts only, but for the branch a link opens", async () => {
    const folded = await liveView(db, null, "");
    expect(folded.total).toBe(71);
    expect(folded.markets.map((m) => [m.market, m.themes.map((t) => [t.theme, t.channels])])).toEqual([
      [
        "fr",
        [
          ["Généralistes", 1],
          ["Non reconnus", 70],
        ],
      ],
    ]);
    expect(folded.loaded.size).toBe(0);
    // One more than a page: the branch goes on.
    const open = await liveView(db, null, LEFT);
    expect([...open.loaded.keys()]).toEqual([LEFT]);
    expect(open.loaded.get(LEFT)).toHaveLength(LIVE_PAGE + 1);
    // Folded, a branch asks for its channels when it opens; open, it holds a page of them and the way to the next.
    const closed = String(await LiveTree({ q: "", view: folded }));
    expect(closed).toContain('hx-trigger="toggle once"');
    expect(closed).toContain("/admin/catalog/branch?q=&amp;market=fr&amp;theme=Non+reconnus&amp;n=0");
    expect(closed).not.toContain("CHAINE 00");
    const opened = String(await LiveTree({ q: "", view: open }));
    expect(opened).toContain("CHAINE 49");
    expect(opened).not.toContain("CHAINE 50");
    expect(opened).toContain("/admin/catalog/branch?q=&amp;market=fr&amp;theme=Non+reconnus&amp;n=50");
    // A branch the search does not leave is not opened.
    expect((await liveView(db, search("tf1 || chaine"), "fr|Sport")).loaded.size).toBe(0);
    expect(branchOf("fr|")).toEqual({ market: "fr", theme: null });
    expect(branchOf("nothing")).toBeNull();
  });

  it("comes unfolded once a search leaves few channels, each under its branch", async () => {
    const few = await liveView(db, search("chaine 0"), "");
    expect(few.total).toBe(10);
    expect([...few.loaded.keys()]).toEqual([LEFT]);
    expect(few.loaded.get(LEFT)!.map((c) => c.name)).toEqual(NAMES.slice(0, 10).map((n) => n.replace("|FR| ", "")));
    expect((await liveView(db, search("zzz"), "")).total).toBe(0);
  });

  it("offers its searches written in advance, each with what it finds", async () => {
    expect((await liveShortcuts()).map((s) => [s.label, s.q, s.count])).toEqual([
      ["Dans l'app de Hakim", 'profil:"Hakim"', 71],
      ["Toutes les chaînes", '-thème:"événements","non reconnus"', 1],
      ["Non rattachées", 'thème:"non reconnus" && marché:"fr"', 70],
      ["Événements", 'thème:"événements" && marché:"fr"', 0],
    ]);
  });
});
