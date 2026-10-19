import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appSecret } from "./crypto";

export const SESSION_COOKIE = "jt_session";
export const SESSION_MS = 30 * 86_400_000;

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  return safeEqual(scryptSync(pw, Buffer.from(salt, "hex"), 64), Buffer.from(hash, "hex"));
}

const sign = (expires: string) => createHmac("sha256", appSecret()).update(expires).digest("hex");

export function createSessionToken(now = Date.now()): string {
  const expires = String(now + SESSION_MS);
  return `${expires}.${sign(expires)}`;
}

export function isValidSession(token: string | undefined, now = Date.now()): boolean {
  const [expires, mac, extra] = token?.split(".") ?? [];
  if (!expires || !mac || extra !== undefined || !/^\d+$/.test(expires)) return false;
  return safeEqual(Buffer.from(mac), Buffer.from(sign(expires))) && now <= Number(expires);
}

export async function requireSession(): Promise<void> {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
}

export function safeNext(next: string | null): string {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";
}

// shortcut: in-memory, resets on restart and isn't shared across processes; fine for one single-user server
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();
const recent = (ip: string, now: number) => (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

export const loginLimiter = {
  check: (ip: string, now = Date.now()) => recent(ip, now).length < MAX_FAILS,
  fail: (ip: string, now = Date.now()) => void fails.set(ip, [...recent(ip, now), now]),
};
