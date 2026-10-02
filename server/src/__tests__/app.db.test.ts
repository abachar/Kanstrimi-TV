import { describe, it, expect, afterAll, vi } from "vitest";
import { closeDb } from "@/test/db";
import { db } from "@/db";
import { env } from "@/shared";
import { app } from "../app";

afterAll(closeDb);
// Before the first request: Hono builds its router then.
app.get("/__test/boom", () => {
  throw new Error('Failed query: select "password" from settings');
});
/** Runs `fn` as in production. */
async function inProduction<T>(fn: () => T | Promise<T>) {
  const was = env.isProd;
  (env as { isProd: boolean }).isProd = true;
  try {
    return await fn();
  } finally {
    (env as { isProd: boolean }).isProd = was;
  }
}

describe("app", () => {
  it("/health: the database answers, the vault state is reported without changing the status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unlocked: expect.any(Boolean) });
  });

  it("/health: a database down is a 500 that tells why in development only; the cause is logged", async () => {
    const down = vi.spyOn(db, "execute").mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const dev = await app.request("/health");
      expect(dev.status).toBe(500);
      expect(((await dev.json()) as { error: string }).error).toContain("ECONNREFUSED");
      const prod = await inProduction(() => app.request("/health"));
      expect(prod.status).toBe(500);
      expect(await prod.json()).toEqual({ ok: false, unlocked: expect.any(Boolean) });
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED"));
    } finally {
      down.mockRestore();
      logged.mockRestore();
    }
  });

  it("the admin answers with a strict CSP: its own scripts only", async () => {
    for (const path of ["/admin", "/admin/login", "/admin/assets/admin.css"]) {
      const csp = (await app.request(path)).headers.get("content-security-policy");
      expect(csp, path).toContain("script-src 'self';");
      expect(csp, path).toContain("default-src 'self';");
      expect(csp, path).not.toMatch(/unsafe-(inline|eval)|nonce-|https:\/\/cdn/);
    }
    expect((await app.request("/health")).headers.get("content-security-policy")).toBeNull();
  });

  it("an unexpected error is logged and answers 500; an HTTP exception keeps its own status", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = await app.request("/__test/boom");
    expect(boom.status).toBe(500);
    expect(await boom.text()).toBe("Erreur interne");
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("/__test/boom"),
      expect.objectContaining({ message: expect.stringContaining("Failed query") }),
    );
    logged.mockRestore();
    // The CSRF check of the admin: a foreign form post is a 403, not a 500.
    const csrf = await app.request("/admin/login", {
      method: "POST",
      body: new URLSearchParams({ password: "x" }),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://evil.test" },
    });
    expect(csrf.status).toBe(403);
    // The body limit: 413.
    const big = await app.request("/admin/login", {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1),
      headers: { "content-type": "text/plain", "content-length": String(1024 * 1024 + 1) },
    });
    expect(big.status).toBe(413);
  });
});
