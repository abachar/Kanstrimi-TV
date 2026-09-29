import { describe, it, expect } from "vitest";
import { redactText, redactUrl } from "../http-log";

describe("redactUrl", () => {
  it("masks the password query parameter", () => {
    expect(redactUrl("/player_api.php?username=admin&password=s3cret")).toBe("/player_api.php?username=admin&password=***");
  });
  it("masks it whatever the case and keeps the other params", () => {
    expect(redactUrl("/get.php?username=admin&PASSWORD=s3cret&type=m3u_plus")).toBe("/get.php?username=admin&PASSWORD=***&type=m3u_plus");
  });
  it("masks the password segment of stream paths", () => {
    expect(redactUrl("/live/admin/s3cret/5769.ts")).toBe("/live/admin/***/5769.ts");
    expect(redactUrl("/movie/admin/s3cret/5729.mkv")).toBe("/movie/admin/***/5729.mkv");
    expect(redactUrl("/series/admin/s3cret/42.mp4")).toBe("/series/admin/***/42.mp4");
  });
  it("masks the TMDB key", () => {
    expect(redactUrl("/x?tmdb_api_key=abc")).toBe("/x?tmdb_api_key=***");
  });
  it("leaves harmless urls untouched", () => {
    expect(redactUrl("/admin/catalog?kind=vod&q=matrix")).toBe("/admin/catalog?kind=vod&q=matrix");
    expect(redactUrl("/health")).toBe("/health");
    expect(redactUrl("/img/w500/abc.jpg")).toBe("/img/w500/abc.jpg");
  });
  it("never leaks the secret, whatever the shape", () => {
    for (const u of ["/player_api.php?password=s3cret", "/live/u/s3cret/1.ts", "/get.php?PassWord=s3cret"]) {
      expect(redactUrl(u)).not.toContain("s3cret");
    }
  });
});

describe("redactText", () => {
  it("masks every URL of a line, stream paths included, and leaves the rest", () => {
    const line = "fetch http://h.test:8080/live/u/s3cret/1.ts failed, then https://h.test/get.php?username=u&password=s3cret (retry)";
    const out = redactText(line);
    expect(out).not.toContain("s3cret");
    expect(out).toContain("http://h.test:8080/live/u/***/1.ts failed");
    expect(out).toContain("(retry)");
  });
});
