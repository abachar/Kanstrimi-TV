import type { ApnsAlert } from "./apns";

/** A waitlist entry the catalogue now carries. */
export type Arrival = { contentKey: string; title: string; year: number | null };
/** What a finished run of the pipeline says of itself: its status, its length, the stats of its steps. */
export type RunSummary = {
  status: "running" | "success" | "error" | "killed";
  message: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  steps: { step: string; status: string; stats: Record<string, unknown> | null }[];
};

/** « Dune : deuxième partie (2024) est disponible. » and the sheet it opens. */
export function waitlistAlert(a: Arrival): ApnsAlert {
  return {
    title: "Film attendu arrivé",
    body: `${a.title}${a.year ? ` (${a.year})` : ""} est disponible.`,
    link: `kanstrimi://open/${a.contentKey}`,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** « 32 min · 12 ajoutés, 3 supprimés · 8 fiches TMDB associées · 1 attendu arrivé », from the steps' stats. */
export function runAlert(run: RunSummary): ApnsAlert {
  const title =
    run.status === "success"
      ? "Traitement complet terminé"
      : run.status === "killed"
        ? "Traitement complet arrêté"
        : "Traitement complet en échec";
  const stat = (step: string, key: string): number => {
    const v = run.steps.find((s) => s.step === step)?.stats?.[key];
    return typeof v === "number" ? v : 0;
  };
  const parts: string[] = [];
  const minutes = run.finishedAt ? Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 60_000) : 0;
  parts.push(minutes < 1 ? "moins d'une minute" : `${minutes} min`);
  const added = stat("source", "items_added");
  const removed = stat("source", "items_removed");
  if (added || removed)
    parts.push([added ? plural(added, "ajouté") : "", removed ? plural(removed, "supprimé") : ""].filter(Boolean).join(", "));
  else if (run.steps.some((s) => s.step === "source")) parts.push("rien de nouveau");
  const matched = stat("enrich", "matched");
  if (matched) parts.push(`${plural(matched, "fiche TMDB associée", "fiches TMDB associées")}`);
  const arrived = stat("group", "waitlist_available") + stat("filters", "waitlist_available");
  if (arrived) parts.push(plural(arrived, "attendu arrivé", "attendus arrivés"));
  if (run.status !== "success" && run.message) parts.push(run.message);
  return { title, body: parts.join(" · ") };
}

export const testAlert = (deviceName: string): ApnsAlert => ({ title: "Kanstrimi", body: `Les alertes arrivent bien sur ${deviceName}.` });
