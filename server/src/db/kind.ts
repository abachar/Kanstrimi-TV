import * as schema from "./schema";

/** The three kinds of catalogue entry, as the provider and the database name them. */
export type Kind = (typeof schema.kindEnum.enumValues)[number];
export const KINDS: readonly Kind[] = schema.kindEnum.enumValues;

export type TmdbMediaType = "movie" | "tv";
/** TMDB's word for a kind. Live channels have no TMDB counterpart; callers exclude them first. */
export const tmdbMediaType = (kind: Kind): TmdbMediaType => (kind === "vod" ? "movie" : "tv");
