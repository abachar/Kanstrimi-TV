import { Cron } from "croner";
import cronstrue from "cronstrue/i18n";

/**
 * Five-field cron expressions ("minute hour day month weekday"), evaluated in local time by
 * `croner`. No seconds field and no `@daily` nickname: the admin documents five fields.
 */
function parse(expr: string): Cron | null {
  if (expr.trim().split(/\s+/).length !== 5) return null;
  try { return new Cron(expr); } catch { return null; }
}

export const isValidCron = (expr: string): boolean => parse(expr) !== null;

/** True if `date` falls on a scheduled minute. */
export function cronMatches(expr: string, date: Date): boolean {
  const cron = parse(expr);
  if (!cron) return false;
  const minute = new Date(date);
  minute.setSeconds(0, 0);
  return cron.nextRun(new Date(minute.getTime() - 1))?.getTime() === minute.getTime();
}

/** Due if the expression matches now and we have not already run within this same minute. */
export function cronDue(expr: string, lastRunIso: string | undefined, now: Date): boolean {
  if (!cronMatches(expr, now)) return false;
  if (!lastRunIso) return true;
  const last = new Date(lastRunIso);
  return Math.floor(last.getTime() / 60_000) !== Math.floor(now.getTime() / 60_000);
}

/** The next scheduled time after `from`; null for an invalid expression. */
export function nextCronRun(expr: string, from = new Date()): Date | null {
  return parse(expr)?.nextRun(from) ?? null;
}

/** "À 03:00", "À l'heure pile, toutes les 6 heures"… */
export function describeCron(expr: string): string {
  if (!isValidCron(expr)) return "expression invalide";
  return cronstrue.toString(expr, { locale: "fr", use24HourTimeFormat: true });
}
