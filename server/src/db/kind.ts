import { kindEnum } from "./schema";

/** The three kinds of catalogue entry, as the provider and the database name them. */
export type Kind = (typeof kindEnum.enumValues)[number];
export const KINDS: readonly Kind[] = kindEnum.enumValues;
