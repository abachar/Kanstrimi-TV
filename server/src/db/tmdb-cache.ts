import { sql } from "drizzle-orm";
import { schema } from "./client";

/**
 * The cached document has its title logos: it was fetched after the logos were added to the request.
 * The entries from before are fetched again (`enrich`, `refreshDetails`). Keep in step with the
 * predicate of `tmdb_cache_logoless_idx` in `schema.ts`, which cannot import it.
 */
export const tmdbHasLogos = sql<boolean>`coalesce(${schema.tmdbCache.data} -> 'images' ? 'logos', false)`;
