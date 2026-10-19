import { expect, test } from "vitest";
import { createSessionToken, hashPassword, isValidSession, loginLimiter, safeNext, verifyPassword } from "@/lib/auth";

const DAY = 86_400_000;

test("password round-trip", () => {
  const h = hashPassword("hunter2");
  expect(h).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  expect(verifyPassword("hunter2", h)).toBe(true);
  expect(verifyPassword("hunter3", h)).toBe(false);
  expect(verifyPassword("x", "garbage")).toBe(false);
});

test("session validity", () => {
  const t0 = 1_000_000;
  const token = createSessionToken(t0);
  expect(isValidSession(token, t0)).toBe(true);
  expect(isValidSession(token, t0 + 30 * DAY)).toBe(true);
  expect(isValidSession(token, t0 + 30 * DAY + 1)).toBe(false);
  const last = token.slice(-1);
  expect(isValidSession(token.slice(0, -1) + (last === "0" ? "1" : "0"), t0)).toBe(false);
  expect(isValidSession(undefined, t0)).toBe(false);
  expect(isValidSession("nodot", t0)).toBe(false);
});

test("safeNext only allows /app paths", () => {
  expect(safeNext("//evil.com")).toBe("/app");
  expect(safeNext("https://evil.com")).toBe("/app");
  expect(safeNext("/settings")).toBe("/app");
  expect(safeNext(null)).toBe("/app");
  expect(safeNext("/app/new?via=bm")).toBe("/app/new?via=bm");
});

test("login limiter blocks after 5 failures in 15 min", () => {
  const ip = "1.2.3.4";
  const t0 = 5_000_000;
  for (let i = 0; i < 5; i++) {
    expect(loginLimiter.check(ip, t0 + i)).toBe(true);
    loginLimiter.fail(ip, t0 + i);
  }
  expect(loginLimiter.check(ip, t0 + 10)).toBe(false);
  expect(loginLimiter.check("5.6.7.8", t0 + 10)).toBe(true);
  expect(loginLimiter.check(ip, t0 + 15 * 60_000 + 5)).toBe(true);
});
