import type { Kind } from "@/db";
import type { Step, KeyKind, Task } from "@/catalog";
import type { IconName } from "./icons";
import type { Tone } from "./ui";

/** French vocabulary of the admin, in one place. */

export const KIND_TITLES: Record<Kind, string> = { live: "Live", vod: "Films", series: "Séries" };
/** The icons of the side menu. */
export const KIND_ICONS: Record<Kind, IconName> = { live: "live", vod: "film", series: "series" };

/** How a content got its key, as shown on its page. */
export const KEY_KIND_LABELS: Record<KeyKind, string> = {
  tmdb: "TMDB",
  fallback: "repli",
  manual: "séparé",
  live: "direct",
};

export const MATCH_LABELS: Record<string, string> = {
  matched: "associé",
  manual: "manuel",
  unmatched: "introuvable",
  pending: "en attente",
  skipped: "sans objet",
};
/** The badge of each status, the same on every page. */
export const MATCH_TONES: Record<string, Tone> = { matched: "ok", manual: "ok", unmatched: "bad", pending: "warn", skipped: "muted" };

export const JOB_LABELS: Record<Step, string> = {
  source: "Source",
  enrich: "Enrichissement",
  filters: "Filtres",
  group: "Groupement",
  trending: "Tendances TMDB",
  epg: "EPG",
  markers: "Marqueurs SkipDB",
};
/** Steps of earlier pipelines, still in the journal until it is purged. */
const PAST_JOB_LABELS: Record<string, string> = { merge: "Mise à jour du catalogue", channels: "Chaînes iptv-org" };
export const JOB_STARTED: Record<Task, string> = {
  pipeline: "Traitement complet lancé",
  epg: "Reconstruction EPG lancée",
  trending: "Tendances TMDB lancées",
  markers: "Import des marqueurs lancé",
};
export const TASK_LABELS: Record<Task, string> = {
  pipeline: "Traitement complet",
  epg: "Guide des programmes",
  trending: "Tendances TMDB",
  markers: "Import SkipDB",
};
export const TASK_ICONS: Record<Task, IconName> = { pipeline: "pipeline", epg: "epg", trending: "sparkles", markers: "play" };
export const TRIGGER_LABELS: Record<string, string> = { cron: "planifié", manual: "manuel" };
export const jobLabel = (job: string) => (JOB_LABELS as Record<string, string>)[job] ?? PAST_JOB_LABELS[job] ?? job;
/** A run's task: one of the scheduled ones, or a lone step. */
export const taskLabel = (task: string) => (TASK_LABELS as Record<string, string>)[task] ?? jobLabel(task);

export const STAT_LABELS: Record<string, string> = {
  live_items: "chaînes",
  vod_items: "films",
  series_items: "séries",
  live_categories: "cat. live",
  vod_categories: "cat. films",
  series_categories: "cat. séries",
  items_added: "ajoutés",
  items_updated: "modifiés",
  items_removed: "supprimés",
  categories_added: "cat. ajoutées",
  categories_updated: "cat. modifiées",
  categories_removed: "cat. supprimées",
  processed: "traités",
  matched: "associés",
  unmatched: "non trouvés",
  errors: "erreurs",
  ids_rejected: "ids amont rejetés",
  items_named: "noms réanalysés",
  retried: "non trouvés retentés",
  refreshed: "fiches TMDB rafraîchies",
  iptv_channels: "chaînes iptv-org",
  iptv_logos: "avec logo",
  iptv_updated: "base mise à jour",
  iptv_matched: "rattachées",
  iptv_by_epg: "par EPG",
  iptv_by_name: "par nom",
  iptv_manual: "à la main",
  epg_mismatch: "EPG fournisseur écartés",
  items_grouped: "variantes",
  contents: "contenus",
  multi_variant: "à plusieurs variantes",
  orphans_removed: "contenus retirés",
  waitlist_available: "attendus devenus disponibles",
  variants_hidden: "versions écartées par les filtres",
  items: "éléments",
  categories: "catégories",
  segments: "intros et génériques",
  titles: "films et séries",
  bytes: "", // bytes are already rendered as "x Mo"
};

/** The « Caches » page: what each cache holds, and how it fills and refreshes. */
export const CACHE_LABELS: Record<
  "tmdb" | "info" | "episodes" | "images" | "epg",
  { title: string; icon: IconName; unit: string; what: string; how: string }
> = {
  tmdb: {
    title: "Fiches TMDB",
    icon: "database",
    unit: "fiches",
    what: "Le détail TMDB de chaque film et série (une ligne par type, identifiant et langue).",
    how: "Rempli à l'enrichissement TMDB, une fiche par identifiant et par langue.",
  },
  info: {
    title: "Infos amont",
    icon: "server",
    unit: "réponses",
    what: "Les réponses get_series_info du fournisseur, une par série.",
    how: "Rempli quand l'app ouvre une série ; relu chez le fournisseur passé 12 h, gardé tel quel s'il est injoignable.",
  },
  episodes: {
    title: "Arbres de séries",
    icon: "series",
    unit: "épisodes",
    what: "Les saisons et épisodes des séries, avec leurs sources chez le fournisseur.",
    how: "Construit quand l'app ouvre une série ; sources amont relues passé 12 h, saisons TMDB passé 30 jours.",
  },
  images: {
    title: "Images",
    icon: "image",
    unit: "fichiers",
    what: "Les affiches et fonds TMDB, les logos iptv-org et les images du Top Shelf, servis par /img.",
    how: "Une image est téléchargée à sa première demande, puis servie depuis le disque.",
  },
  epg: {
    title: "Guide des programmes (EPG)",
    icon: "epg",
    unit: "programmes",
    what: "Les programmes des chaînes visibles, importés du XMLTV du fournisseur (six jours devant), servis en « maintenant / ensuite ».",
    how: "Reconstruit par le job « EPG » selon son cron ; un import vide ou en échec garde le guide précédent.",
  },
};
