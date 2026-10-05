import { type FileFacts, markersOf } from "@/catalog";
import type { PlaybackMarkers } from "./types";

/** « À suivre » counts this long from the start of the credits, then what follows starts. */
const CREDITS_COUNTDOWN_SECONDS = 20;

/**
 * `/playback/{id}/markers`: what can be skipped in the file the app opened and where its end credits start, with
 * what it shows of them.
 */
export async function playbackMarkers(key: string, file: FileFacts): Promise<PlaybackMarkers> {
  const { recap, intro, credits } = await markersOf(key, file);
  const skips = [recap && { ...recap, label: "Passer le récap" }, intro && { ...intro, label: "Passer l'intro" }];
  return {
    skips: skips.filter((s) => s !== null).sort((a, b) => a.start - b.start),
    credits: credits === null ? null : { at: credits, countdown: CREDITS_COUNTDOWN_SECONDS },
  };
}
