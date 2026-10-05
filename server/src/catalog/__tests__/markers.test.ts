import { describe, it, expect } from "vitest";
import { chapterMarkers, type FileChapter } from "../markers";

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
