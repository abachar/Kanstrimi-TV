import { describe, it, expect } from "vitest";
import { baseMarkers, chapterMarkers, type FileChapter } from "../markers";

/** Chapters from their starts: each one ends where the next begins, the last at the end of the file. */
const file = (duration: number, ...marks: [number, string][]) => ({
  duration,
  chapters: marks.map(([start, name], i): FileChapter => ({ name, start, end: marks[i + 1]?.[0] ?? duration })),
});

describe("chapter names", () => {
  it("a Netflix file: « Intro » and « Credits » between its parts", () => {
    expect(chapterMarkers(file(3483.68, [0, "Part 01"], [71, "Intro"], [86, "Part 02"], [3257, "Credits"]))).toEqual({
      intro: { start: 71, end: 86 },
      credits: 3257,
    });
  });

  it("credits alone", () => {
    expect(chapterMarkers(file(2840, [0, "Part 01"], [2741, "Credits"]))).toEqual({ intro: null, credits: 2741 });
    expect(chapterMarkers(file(2602, [0, "Scene 1"], [2596 - 60, "Outro"]))).toEqual({ intro: null, credits: 2536 });
  });

  it("a numbered name is read without its number; a scene that only mentions the credits is not one", () => {
    const m = chapterMarkers(
      file(
        1266,
        [1, "1. The Guys Enjoy Dinner"],
        [37, "2. Penny Asks Leonard for a Favor, Opening Credits"],
        [223, "3. Main Title Sequence"],
        [245, "4. Sheldon and Leonard Receive Penny's Delivery"],
      ),
    );
    expect(m).toEqual({ intro: { start: 223, end: 245 }, credits: null });
  });

  it("no case, no accents; « Générique » alone is the intro or the credits by where it starts", () => {
    expect(chapterMarkers(file(6000, [0, "GÉNÉRIQUE"], [90, "Film"], [5600, "Générique de fin"]))).toEqual({
      intro: { start: 0, end: 90 },
      credits: 5600,
    });
    expect(chapterMarkers(file(6000, [0, "Film"], [5600, "générique"])).credits).toBe(5600);
  });

  it("plain names say nothing: « Chapter 20 », a timecode, « Fin »", () => {
    expect(chapterMarkers(file(10144, [0, "Chapter 1"], [600, "Chapter 2"], [9838, "Chapter 20"]))).toEqual({ intro: null, credits: null });
    expect(chapterMarkers(file(3264, [0, "00:00:00.000"], [601, "00:10:01.601"]))).toEqual({ intro: null, credits: null });
    expect(chapterMarkers(file(9271, [0, "Braquage"], [8944, "Fin"])).credits).toBeNull();
    expect(chapterMarkers({ duration: 3000, chapters: [] })).toEqual({ intro: null, credits: null });
  });
});

describe("only what is sure", () => {
  it("credits followed by another chapter: something still plays", () => {
    expect(chapterMarkers(file(7000, [0, "Film"], [6500, "End Credits"], [6900, "Scene"])).credits).toBeNull();
  });

  it("credits in the last half-minute are left to the end of the file", () => {
    expect(chapterMarkers(file(5876, [0, "Film"], [5856, "End Credits"])).credits).toBeNull();
    expect(chapterMarkers(file(5876, [0, "Film"], [5831, "End Credits"])).credits).toBe(5831);
  });

  it("an « Intro » in the second half, a « Credits » in the first, an intro of a second or of a quarter of an hour", () => {
    expect(chapterMarkers(file(3000, [0, "Part 01"], [2000, "Intro"], [2060, "Part 02"])).intro).toBeNull();
    expect(chapterMarkers(file(3000, [0, "Credits"])).credits).toBeNull();
    expect(chapterMarkers(file(3000, [0, "Part 01"], [10, "Intro"], [11, "Part 02"])).intro).toBeNull();
    expect(chapterMarkers(file(3000, [0, "Intro"], [900, "Part 02"])).intro).toBeNull();
  });

  it("chapters out of the file or out of order are put back or dropped", () => {
    const chapters: FileChapter[] = [
      { name: "Credits", start: 3257, end: 3483 },
      { name: "Bonus", start: 9000, end: 9100 },
      { name: "Intro", start: 71, end: 86 },
      { name: "Broken", start: 500, end: 500 },
    ];
    expect(chapterMarkers({ duration: 3483, chapters })).toEqual({ intro: { start: 71, end: 86 }, credits: 3257 });
  });
});

describe("what a base of markers says", () => {
  const intro = (start: number, end: number, measuredOn: number | null) => ({ kind: "intro" as const, start, end, measuredOn });
  const credits = (start: number, end: number | null, measuredOn: number | null) => ({ kind: "credits" as const, start, end, measuredOn });

  it("measured on a file of the same length, to its end: the intro and the credits", () => {
    expect(baseMarkers([intro(0, 15, 3547), credits(3426, 3547, 3547)], 3547.2)).toEqual({ intro: { start: 0, end: 15 }, credits: 3426 });
    // Three seconds apart is still the same release; a base that leaves the end open means the end of the file.
    expect(baseMarkers([credits(2538, null, 2586)], 2583).credits).toBe(2538);
  });

  it("measured on another file: the intro is kept, the credits are not", () => {
    expect(baseMarkers([intro(276, 325, 3384), credits(3194, 3384, 3384)], 3264)).toEqual({
      intro: { start: 276, end: 325 },
      credits: null,
    });
    expect(baseMarkers([intro(54, 144, null), credits(1345, 1452, null)], 1452)).toEqual({ intro: { start: 54, end: 144 }, credits: null });
  });

  it("several intros: the one measured on the closest file", () => {
    expect(baseMarkers([intro(10, 50, null), intro(70, 110, 3526), intro(15, 56, 3481)], 3480).intro).toEqual({ start: 15, end: 56 });
  });

  it("several credits on the same file: the latest start, the one that cuts the least", () => {
    expect(baseMarkers([credits(3255, 3322, 3322), credits(3250, 3320, 3320)], 3320).credits).toBe(3255);
  });

  it("credits a base ends before the end of the file are followed by something", () => {
    expect(baseMarkers([credits(7991, 8200, 8575)], 8575).credits).toBeNull();
  });

  it("what cannot be: an intro in the second half or of a quarter of an hour, credits in the first half or too short", () => {
    expect(baseMarkers([intro(7512, 7546, 7600)], 7600).intro).toBeNull();
    expect(baseMarkers([intro(0, 900, 3000)], 3000).intro).toBeNull();
    expect(baseMarkers([credits(100, 3000, 3000)], 3000).credits).toBeNull();
    expect(baseMarkers([credits(2990, 3000, 3000)], 3000).credits).toBeNull();
    expect(baseMarkers([], 3000)).toEqual({ intro: null, credits: null });
  });
});
