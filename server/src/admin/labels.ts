import type { Kind } from "@/db";
import type { Step, KeyKind } from "@/catalog";

/** French vocabulary of the admin, in one place. */

export const KIND_TITLES: Record<Kind, string> = { live: "Live", vod: "Films", series: "Séries" };
/** Singular, for one entry. */
export const KIND_NAMES: Record<Kind, string> = { live: "Chaîne", vod: "Film", series: "Série" };
export const KIND_LABELS: Record<Kind | "all", string> = { all: "tous", live: "live", vod: "films", series: "séries" };

/** How a content got its key, as shown in the "Groupes" view. */
export const KEY_KIND_LABELS: Record<KeyKind, string> = {
  tmdb: "TMDB",
  fallback: "repli",
  manual: "séparé",
  live: "direct",
  merged: "fusion",
};

export const MATCH_LABELS: Record<string, string> = {
  matched: "associé",
  manual: "manuel",
  unmatched: "introuvable",
  pending: "en attente",
  skipped: "sans objet",
};

export const JOB_LABELS: Record<Step, string> = {
  source: "Lecture source",
  filters: "Filtres",
  enrich: "Enrichissement TMDB",
  group: "Groupement",
  epg: "EPG",
};
export const JOB_STARTED: Record<Step | "pipeline", string> = {
  source: "Lecture de la source lancée",
  filters: "Filtres appliqués",
  enrich: "Enrichissement lancé",
  group: "Groupement lancé",
  epg: "Reconstruction EPG lancée",
  pipeline: "Traitement complet lancé",
};
export const jobLabel = (job: string) => (JOB_LABELS as Record<string, string>)[job] ?? job;

export const STAT_LABELS: Record<string, string> = {
  live_items: "chaînes",
  vod_items: "films",
  series_items: "séries",
  live_categories: "cat. live",
  vod_categories: "cat. films",
  series_categories: "cat. séries",
  removed_items: "supprimés",
  removed_categories: "cat. supprimées",
  processed: "traités",
  matched: "associés",
  unmatched: "non trouvés",
  errors: "erreurs",
  ids_rejected: "ids amont rejetés",
  items_grouped: "variantes",
  contents: "contenus",
  multi_variant: "à plusieurs variantes",
  orphans_removed: "contenus retirés",
  items: "éléments",
  categories: "catégories",
  bytes: "", // bytes are already rendered as "x Mo"
};
