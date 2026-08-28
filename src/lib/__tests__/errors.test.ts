import { describe, it, expect } from "vitest";
import { describeError } from "../errors";

describe("describeError", () => {
  it("prefers the driver cause over Drizzle's SQL dump", () => {
    const e = Object.assign(new Error(`Failed query: insert into "items" ${"($1), ".repeat(5000)}`), {
      cause: Object.assign(new Error("ON CONFLICT DO UPDATE command cannot affect row a second time"), { code: "21000" }),
    });
    const out = describeError(e);
    expect(out).toBe("[21000] ON CONFLICT DO UPDATE command cannot affect row a second time");
    expect(out).not.toContain("insert into");
  });
  it("appends detail and hint when present", () => {
    const e = { message: "boom", cause: { message: "duplicate key", detail: "Key (id)=(1) exists." } };
    expect(describeError(e)).toBe("duplicate key — Key (id)=(1) exists.");
  });
  it("truncates long messages", () => {
    const out = describeError(new Error("x".repeat(5000)));
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out.endsWith("…")).toBe(true);
  });
  it("collapses newlines", () => {
    expect(describeError(new Error("a\n  b"))).toBe("a b");
  });
  it("handles non-Error throws", () => {
    expect(describeError("plain string")).toBe("plain string");
  });
});
