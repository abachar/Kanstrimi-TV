import { describe, it, expect } from "vitest";
import { compileRules, isHidden } from "../rules";
import type { FilterRule } from "@/db/schema";

const rule = (p: Partial<FilterRule>): FilterRule => ({
  id: 1, name: "r", kind: null, target: "name", pattern: ".", flags: "i", action: "hide", enabled: true, position: 0, createdAt: new Date(), ...p,
});

describe("isHidden", () => {
  it("hide rule hides matches only", () => {
    const c = compileRules([rule({ pattern: "xxx|adult" })]);
    expect(isHidden(c, "live", "name", "XXX Channel")).toBe(true);
    expect(isHidden(c, "live", "name", "TF1")).toBe(false);
  });
  it("keep rule acts as whitelist", () => {
    const c = compileRules([rule({ pattern: "^FR", kind: "live" })].map((r) => ({ ...r, action: "keep" as const })));
    expect(isHidden(c, "live", "name", "FR: TF1")).toBe(false);
    expect(isHidden(c, "live", "name", "UK: BBC")).toBe(true);
    expect(isHidden(c, "vod", "name", "UK movie")).toBe(false); // rule scoped to live
  });
  it("later rule wins", () => {
    const c = compileRules([rule({ id: 1, pattern: "sport", position: 0 }), rule({ id: 2, pattern: "bein", action: "keep", position: 1 })]);
    expect(isHidden(c, "live", "name", "beIN Sport 1")).toBe(false);
    expect(isHidden(c, "live", "name", "Eurosport")).toBe(true);
  });
  it("skips disabled and invalid regex", () => {
    const c = compileRules([rule({ pattern: "(", enabled: true }), rule({ id: 2, pattern: "tf1", enabled: false })]);
    expect(isHidden(c, "live", "name", "TF1")).toBe(false);
  });
});
