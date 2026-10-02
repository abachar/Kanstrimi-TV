import { describe, it, expect, vi, afterEach } from "vitest";
import { singleFlight } from "../single-flight";

afterEach(() => vi.useRealTimers());

describe("singleFlight", () => {
  it("runs one call per key at a time: the others join it", async () => {
    const once = singleFlight<number | null>(null);
    let calls = 0;
    let release!: (n: number) => void;
    const fn = () => {
      calls++;
      return new Promise<number>((r) => (release = r));
    };
    const a = once("k", fn);
    const b = once("k", fn);
    release(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(calls).toBe(1);
    expect(await once("k", async () => 8)).toBe(8); // done: a new call runs
  });

  it("answers the fallback after a failure, for the retry delay only, and forgets the old failures", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
    const errors: string[] = [];
    const once = singleFlight(false, { retryAfterMs: 60_000, onError: (_e, key) => errors.push(key) });
    const boom = vi.fn(async () => {
      throw new Error("TMDB 500");
    });
    expect(await once("a", boom)).toBe(false);
    expect(errors).toEqual(["a"]);
    expect(await once("a", async () => true)).toBe(false); // still within the delay: not even tried
    expect(once.failures()).toBe(1);
    vi.setSystemTime(new Date("2026-10-02T12:01:01Z"));
    expect(await once("b", boom)).toBe(false); // a new failure sweeps the expired ones
    expect(once.failures()).toBe(1);
    expect(await once("a", async () => true)).toBe(true);
    once.reset();
    expect(once.failures()).toBe(0);
  });

  it("turns a synchronous throw into the fallback", async () => {
    const once = singleFlight("none");
    expect(
      await once("x", () => {
        throw new Error("sync");
      }),
    ).toBe("none");
  });
});
