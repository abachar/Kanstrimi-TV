import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { resetDb, closeDb } from "@/test/db";
import { DEFAULTS, lockForTests, verify, type Settings } from "@/config";
import { isTaskRunning, launch, scheduledJobs, schedule, stopSchedule } from "../pipeline";

beforeAll(resetDb);
afterEach(stopSchedule);
afterAll(closeDb);

describe("launch", () => {
  it("refuses while the vault is locked: no key, no provider", async () => {
    lockForTests();
    expect(launch("epg")).toBe(false);
    expect(isTaskRunning("epg")).toBe(false);
  });

  it("starts a task in the background, once at a time", async () => {
    expect(await verify("test")).toBe(true);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(launch("epg")).toBe(true); // fails at once (no provider set up), but it ran
    expect(isTaskRunning("epg")).toBe(true);
    expect(launch("epg")).toBe(false);
    await vi.waitUntil(() => !isTaskRunning("epg"), { timeout: 5000 });
    expect(isTaskRunning("epg")).toBe(false);
    logged.mockRestore();
  });
});

describe("schedule", () => {
  it("plans the two tasks from the settings, and replaces them on every change", () => {
    const s = { ...DEFAULTS, sync_cron: "0 */6 * * *", epg_cron: "0 3 */3 * *" } as Settings;
    schedule(s);
    expect(scheduledJobs().map((j) => j.name)).toEqual(["traitement complet", "EPG"]);
    expect(scheduledJobs().every((j) => j.next instanceof Date)).toBe(true);
    schedule({ ...s, epg_cron: "30 4 * * *" });
    expect(scheduledJobs()).toHaveLength(2);
    expect(scheduledJobs()[1].next?.getMinutes()).toBe(30);
  });

  it("ignores a cron expression it cannot read, and says so", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    schedule({ ...DEFAULTS, sync_cron: "toutes les heures", epg_cron: "0 3 */3 * *" } as Settings);
    expect(scheduledJobs().map((j) => j.name)).toEqual(["EPG"]);
    expect(String(logged.mock.calls[0][0])).toContain("ignoré");
    logged.mockRestore();
  });
});
