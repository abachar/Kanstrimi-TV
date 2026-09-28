import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The dependency rules of `src/`, as the README states them. A grep, not a type: what the
 * compiler cannot refuse, this test does.
 */
const root = path.resolve(import.meta.dirname, "..");
const files = walk(root).filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__") && !f.includes(`${path.sep}test${path.sep}`));
function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const block = (f: string) => {
  const rel = path.relative(root, f).split(path.sep);
  return rel[0] === "providers" ? `providers/${rel[1]}` : rel[0];
};
const imports = (f: string) =>
  [...fs.readFileSync(f, "utf8").matchAll(/from "(@\/[^"]+)"|import\("(@\/[^"]+)"\)/g)].map((m) => (m[1] ?? m[2]).slice(2));
const named = (f: string, from: string) =>
  [...fs.readFileSync(f, "utf8").matchAll(new RegExp(`import (?:type )?\\{([^}]+)\\} from "@/${from}"`, "g"))].flatMap((m) =>
    m[1].split(",").map((n) => n.replace("type ", "").trim().split(" as ")[0]),
  );
const offenders = (pred: (blk: string, imp: string) => boolean) =>
  files.flatMap((f) =>
    imports(f)
      .filter((imp) => pred(block(f), imp))
      .map((imp) => `${path.relative(root, f)} → @/${imp}`),
  );

/** Who may import whom: the graph of the README, bottom-up. */
const ALLOWED: Record<string, string[]> = {
  shared: [],
  db: ["shared"],
  config: ["db", "shared"],
  "providers/xtream": ["config", "db", "shared"],
  "providers/tmdb": ["config", "db", "shared"],
  catalog: ["providers/xtream", "providers/tmdb", "config", "db", "shared"],
  devices: ["config", "db", "shared"],
  player: ["catalog", "devices", "providers/xtream", "config", "db", "shared"],
  admin: ["player", "catalog", "devices", "providers/xtream", "providers/tmdb", "config", "db", "shared"],
  "main.ts": ["player", "admin", "catalog", "providers/tmdb", "config", "db", "shared"],
};

describe("architecture", () => {
  it("every block imports only the blocks below it", () => {
    expect(offenders((blk, imp) => !(ALLOWED[blk] ?? []).includes(imp))).toEqual([]);
  });
  it("blocks are entered through their index.ts, never by a deep path", () => {
    expect(offenders((_blk, imp) => imp.split("/").length > (imp.startsWith("providers/") ? 2 : 1))).toEqual([]);
  });
  it("shared knows nothing of the project", () => {
    expect(offenders((blk, imp) => blk === "shared" && imp.length > 0)).toEqual([]);
  });
  it("player ignores admin (admin may read player, never the reverse)", () => {
    expect(offenders((blk, imp) => blk === "player" && imp === "admin")).toEqual([]);
  });
  it("player takes one pure function from the Xtream provider, and nothing from TMDB", () => {
    const fromXtream = files.filter((f) => block(f) === "player").flatMap((f) => named(f, "providers/xtream"));
    expect([...new Set(fromXtream)]).toEqual(["upstreamStreamUrl"]);
  });
});
