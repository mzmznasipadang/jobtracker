"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MS, createSessionToken, loginLimiter, safeNext, verifyPassword } from "@/lib/auth";

export async function login(formData: FormData): Promise<void> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = (error: string) => redirect(`/login?error=${error}&next=${encodeURIComponent(next)}`);

  if (!loginLimiter.check(ip)) back("limited");
  if (!verifyPassword(String(formData.get("password") ?? ""), process.env.ADMIN_PASSWORD_HASH ?? "")) {
    loginLimiter.fail(ip);
    back("wrong");
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  redirect(next);
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
