import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { resetDb, closeDb } from "@/test/db";
import { verify } from "@/config";
import { admin } from "../..";
import { resetLoginAttempts } from "../attempts";

const app = new Hono().route("/admin", admin);
const login = (password: string, ip = "203.0.113.7") =>
  app.request("/admin/login", {
    method: "POST",
    body: new URLSearchParams({ email: "a.bachar@hotmail.fr", password }),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost", "x-forwarded-for": ip },
  });

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true); // the vault already open: the cheap path exists, the login must not take it
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetLoginAttempts();
});
afterAll(closeDb);

describe("/admin/login", () => {
  it("checks the password with bcrypt every time, even with the vault open", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    expect((await login("test")).headers.get("set-cookie")).toMatch(/^kanstrimi_admin=/);
    expect((await login("nope")).headers.get("location")).toContain("err=");
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it("answers 429 at the sixth failure in a row from one address, with a wait that doubles, without checking the password", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T12:00:00Z") });
    for (let i = 0; i < 5; i++) expect((await login("nope")).status).toBe(303);
    const compare = vi.spyOn(bcrypt, "compare");
    const sixth = await login("test"); // even the right password waits
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBe("1");
    expect(await sixth.text()).toContain("Trop de tentatives");
    expect(compare).not.toHaveBeenCalled();
    // Another address is not held back.
    expect((await login("nope", "198.51.100.1")).status).toBe(303);
    // Once the wait is over, one more try; failed, the next wait is twice as long.
    vi.setSystemTime(new Date("2026-10-02T12:00:01.500Z"));
    expect((await login("nope")).status).toBe(303);
    const again = await login("nope");
    expect(again.status).toBe(429);
    expect(again.headers.get("retry-after")).toBe("2");
    // A success clears the address.
    vi.setSystemTime(new Date("2026-10-02T12:00:04Z"));
    expect((await login("test")).status).toBe(303);
    expect((await login("nope")).status).toBe(303);
  });
});
