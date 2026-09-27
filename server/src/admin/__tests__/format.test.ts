import { describe, it, expect } from "vitest";
import { isValidCron, describeCron, nextCronRun } from "../format";

describe("isValidCron", () => {
  it.each(["0 */6 * * *", "0 3 * * *", "*/30 * * * *", "15 2,14 * * 1-5", "0 0 1 1 *"])("valid: %s", (e) =>
    expect(isValidCron(e)).toBe(true),
  );
  it.each(["", "* * * *", "0 0 * * * *", "@daily", "60 * * * *", "0 24 * * *", "0 0 32 * *", "a b c d e", "0 0 * * 8"])(
    "invalid: %s",
    (e) => expect(isValidCron(e)).toBe(false),
  );
});

describe("nextCronRun", () => {
  it("gives the next scheduled minute", () => {
    expect(nextCronRun("0 */6 * * *", new Date(2026, 7, 25, 6, 0))).toEqual(new Date(2026, 7, 25, 12, 0));
    expect(nextCronRun("0 3 * * *", new Date(2026, 7, 25, 6, 0))).toEqual(new Date(2026, 7, 26, 3, 0));
    expect(nextCronRun("bad")).toBeNull();
  });
});

describe("describeCron", () => {
  it("humanizes in French", () => {
    expect(describeCron("0 */6 * * *")).toBe("À l'heure pile, toutes les 6 heures");
    expect(describeCron("0 3 * * *")).toBe("À 03:00");
    expect(describeCron("*/30 * * * *")).toBe("Toutes les 30 minutes");
    expect(describeCron("15 2,14 * * 1-5")).toBe("À 02:15 et 14:15, de lundi à vendredi");
    expect(describeCron("x")).toBe("expression invalide");
  });
});
