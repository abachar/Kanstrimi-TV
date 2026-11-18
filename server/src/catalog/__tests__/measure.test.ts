import { describe, it, expect } from "vitest";
import { qualityOfPicture } from "../measure";

describe("qualityOfPicture", () => {
  it("names the usual sizes", () => {
    expect(qualityOfPicture(3840, 2160)).toBe("4K");
    expect(qualityOfPicture(1920, 1080)).toBe("FHD");
    expect(qualityOfPicture(1280, 720)).toBe("HD");
    expect(qualityOfPicture(720, 576)).toBe("SD");
    expect(qualityOfPicture(1024, 576)).toBe("SD");
  });

  it("a film in scope is as wide as its name says, less high", () => {
    expect(qualityOfPicture(3840, 1608)).toBe("4K");
    expect(qualityOfPicture(1920, 800)).toBe("FHD");
    expect(qualityOfPicture(1280, 534)).toBe("HD");
  });

  it("an anamorphic or upright picture counts by its height", () => {
    expect(qualityOfPicture(1440, 1080)).toBe("FHD");
    expect(qualityOfPicture(960, 720)).toBe("HD");
    expect(qualityOfPicture(2880, 2160)).toBe("4K");
  });
});
