import { Cron } from "croner";
import cronstrue from "cronstrue/i18n";

/** French formats of the admin: numbers, relative times, durations, cron expressions. */

export function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}
const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function ago(iso?: string | null) {
  if (!iso) return "jamais";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return relative.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return relative.format(-h, "hour");
  return relative.format(-Math.round(h / 24), "day");
}
export function duration(a: Date, b: Date) {
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ---------------------------------------------------------------- cron

/**
 * Five-field cron expressions ("minute hour day month weekday"), the same `croner` parser the
 * pipeline schedules with. No seconds field and no `@daily` nickname: the form documents five fields.
 */
function parse(expr: string): Cron | null {
  if (expr.trim().split(/\s+/).length !== 5) return null;
  try {
    return new Cron(expr);
  } catch {
    return null;
  }
}

export const isValidCron = (expr: string): boolean => parse(expr) !== null;

/** The next scheduled time after `from`; null for an invalid expression. */
export function nextCronRun(expr: string, from = new Date()): Date | null {
  return parse(expr)?.nextRun(from) ?? null;
}

/** "À 03:00", "À l'heure pile, toutes les 6 heures"… */
export function describeCron(expr: string): string {
  if (!isValidCron(expr)) return "expression invalide";
  return cronstrue.toString(expr, { locale: "fr", use24HourTimeFormat: true });
}
