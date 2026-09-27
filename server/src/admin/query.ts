import { KINDS, type Kind } from "@/db";

/** Query-string parsing shared by the catalogue pages. */

/** The value when it is one of the allowed ones, else the fallback. */
export function pickEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
export const kindParam = (value?: string): Kind => pickEnum(value, KINDS, "vod");
export const pageParam = (value?: string): number => Math.max(1, Number(value) || 1);
