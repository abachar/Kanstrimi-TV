/** Minimal 5-field cron evaluator: "min hour day-of-month month day-of-week". */
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function parseField(field: string, [lo, hi]: [number, number]): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    let step = 1, range = part;
    const slash = part.split("/");
    if (slash.length === 2) { range = slash[0]; step = Number(slash[1]); if (!Number.isInteger(step) || step < 1) return null; }
    let start = lo, end = hi;
    if (range !== "*") {
      const dash = range.split("-");
      if (dash.length === 1) { start = end = Number(dash[0]); }
      else if (dash.length === 2) { start = Number(dash[0]); end = Number(dash[1]); }
      else return null;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < lo || end > hi || start > end) return null;
    }
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return out;
}

export function isValidCron(expr: string): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  return f.every((field, i) => parseField(field, RANGES[i]) !== null);
}

/** True if `date` matches the cron expression (to the minute). Sunday = 0 or 7. */
export function cronMatches(expr: string, date: Date): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const sets = f.map((field, i) => parseField(field, RANGES[i]));
  if (sets.some((x) => x === null)) return false;
  const [min, hour, dom, mon, dow] = sets as Set<number>[];
  const jsDow = date.getDay(); // 0..6, Sunday=0
  const domStar = f[2] === "*", dowStar = f[4] === "*";
  const domOk = dom.has(date.getDate());
  const dowOk = dow.has(jsDow) || (jsDow === 0 && dow.has(7));
  // Standard cron: if both dom and dow are restricted, match on either.
  const dayOk = domStar && dowStar ? true : domStar ? dowOk : dowStar ? domOk : (domOk || dowOk);
  return min.has(date.getMinutes()) && hour.has(date.getHours()) && mon.has(date.getMonth() + 1) && dayOk;
}

/** Due if the expression matches now and we haven't already run within this same minute. */
export function cronDue(expr: string, lastRunIso: string | undefined, now: Date): boolean {
  if (!isValidCron(expr) || !cronMatches(expr, now)) return false;
  if (!lastRunIso) return true;
  const last = new Date(lastRunIso);
  return last.getFullYear() !== now.getFullYear() || last.getMonth() !== now.getMonth()
    || last.getDate() !== now.getDate() || last.getHours() !== now.getHours() || last.getMinutes() !== now.getMinutes();
}

/** Rough human description for the common shapes. */
export function describeCron(expr: string): string {
  if (!isValidCron(expr)) return "expression invalide";
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  if (mon === "*" && dom === "*" && dow === "*") {
    if (hour.startsWith("*/")) return `toutes les ${hour.slice(2)} h`;
    if (min.startsWith("*/") && hour === "*") return `toutes les ${min.slice(2)} min`;
    if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return `chaque jour à ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (hour === "*" && /^\d+$/.test(min)) return `chaque heure à la minute ${min}`;
  }
  return expr;
}
