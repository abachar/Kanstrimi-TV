import { describe, expect, it } from "vitest";
import { wireId } from "../wire";

describe("wireId", () => {
  it("sends a plain integer id back as a number, like a real Xtream panel", () => {
    expect(wireId("17001")).toBe(17001);
    expect(wireId("0")).toBe(0);
  });
  it("keeps anything that would not round-trip as text", () => {
    expect(wireId("007")).toBe("007");
    expect(wireId("12.5")).toBe("12.5");
    expect(wireId("abc-1")).toBe("abc-1");
    expect(wireId("")).toBe("");
    expect(wireId("99999999999999999999")).toBe("99999999999999999999");
  });
});
