export type DayBudget = {
  /** True when a request may leave: no pause running, and the day's budget not spent. It counts it. */
  take: () => boolean;
  /** Nothing leaves for `ms`: the answer to a refusal. */
  pause: (ms: number) => void;
  /** Forget the day's count and the pause (tests). */
  reset: () => void;
};

/** The requests a public base is asked in a day (UTC), `perDay` at most, and the pause after it refuses. */
export function dayBudget(perDay: number): DayBudget {
  let spent = { day: "", requests: 0 };
  let pausedUntil = 0;
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    take() {
      if (Date.now() < pausedUntil) return false;
      if (spent.day !== today()) spent = { day: today(), requests: 0 };
      if (spent.requests >= perDay) return false;
      spent.requests++;
      return true;
    },
    pause(ms) {
      pausedUntil = Date.now() + ms;
    },
    reset() {
      spent = { day: "", requests: 0 };
      pausedUntil = 0;
    },
  };
}
