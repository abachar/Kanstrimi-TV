import { describe, it, expect } from "vitest";
import { isValidCron, cronMatches, cronDue, describeCron } from "../cron";

describe("isValidCron", () => {
  it.each(["0 */6 * * *", "0 3 * * *", "*/30 * * * *", "15 2,14 * * 1-5", "0 0 1 1 *"])("valid: %s", (e) => expect(isValidCron(e)).toBe(true));
  it.each(["", "* * * *", "60 * * * *", "0 24 * * *", "0 0 32 * *", "a b c d e", "0 0 * * 8"])("invalid: %s", (e) => expect(isValidCron(e)).toBe(false));
});

describe("cronMatches", () => {
  it("matches every 6h at minute 0", () => {
    expect(cronMatches("0 */6 * * *", new Date(2026, 7, 25, 6, 0))).toBe(true);
    expect(cronMatches("0 */6 * * *", new Date(2026, 7, 25, 6, 1))).toBe(false);
    expect(cronMatches("0 */6 * * *", new Date(2026, 7, 25, 7, 0))).toBe(false);
  });
  it("matches daily at 03:00", () => {
    expect(cronMatches("0 3 * * *", new Date(2026, 7, 25, 3, 0))).toBe(true);
    expect(cronMatches("0 3 * * *", new Date(2026, 7, 25, 4, 0))).toBe(false);
  });
  it("weekday range (Mon-Fri)", () => {
    expect(cronMatches("0 9 * * 1-5", new Date(2026, 7, 24, 9, 0))).toBe(true); // Mon
    expect(cronMatches("0 9 * * 1-5", new Date(2026, 7, 23, 9, 0))).toBe(false); // Sun
  });
});

describe("cronDue", () => {
  const now = new Date(2026, 7, 25, 6, 0);
  it("due when matching and never run", () => expect(cronDue("0 */6 * * *", undefined, now)).toBe(true));
  it("not due twice in the same minute", () => expect(cronDue("0 */6 * * *", now.toISOString(), now)).toBe(false));
  it("due again a minute later cycle", () => expect(cronDue("0 */6 * * *", new Date(2026, 7, 25, 0, 0).toISOString(), now)).toBe(true));
});

describe("describeCron", () => {
  it("humanizes", () => {
    expect(describeCron("0 */6 * * *")).toBe("toutes les 6 h");
    expect(describeCron("0 3 * * *")).toBe("chaque jour à 03:00");
    expect(describeCron("*/30 * * * *")).toBe("toutes les 30 min");
  });
});
