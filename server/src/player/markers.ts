import { type FileFacts, markersOf } from "@/catalog";
import type { PlaybackMarkers } from "./types";

/** « À suivre » counts this long from the start of the credits, then what follows starts. */
const CREDITS_COUNTDOWN_SECONDS = 20;

/** `/playback/{id}/markers`: the intro and the end credits of the file the app opened, with what it shows of them. */
export async function playbackMarkers(key: string, file: FileFacts): Promise<PlaybackMarkers> {
  const { intro, credits } = await markersOf(key, file);
  return {
    intro: intro && { ...intro, label: "Passer l'intro" },
    credits: credits === null ? null : { at: credits, countdown: CREDITS_COUNTDOWN_SECONDS },
  };
}
