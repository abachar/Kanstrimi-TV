import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, isEncrypted } from "../crypto";

describe("crypto", () => {
  const key = deriveKey("secret", Buffer.from("saltsaltsaltsalt"));
  it("round-trips", () => {
    const v = encrypt(key, "hello wörld");
    expect(isEncrypted(v)).toBe(true);
    expect(decrypt(key, v)).toBe("hello wörld");
  });
  it("uses a fresh IV each time", () => {
    expect(encrypt(key, "x")).not.toBe(encrypt(key, "x"));
  });
  it("rejects a wrong key", () => {
    const other = deriveKey("other", Buffer.from("saltsaltsaltsalt"));
    expect(() => decrypt(other, encrypt(key, "x"))).toThrow();
  });
  it("rejects tampering", () => {
    const v = encrypt(key, "x");
    const t = v.slice(0, -2) + (v.endsWith("A=") ? "B=" : "A=");
    expect(() => decrypt(key, t)).toThrow();
  });
  it("rejects a shortened authentication tag: a forgery would only have to guess 4 bytes", () => {
    const [iv, tag, ct] = encrypt(key, "secret").slice("enc:v1:".length).split(":");
    const short = `enc:v1:${iv}:${Buffer.from(tag, "base64").subarray(0, 4).toString("base64")}:${ct}`;
    expect(() => decrypt(key, short)).toThrow();
  });
});
