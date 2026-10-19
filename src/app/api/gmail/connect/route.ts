import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { authUrl, STATE_COOKIE } from "@/lib/email/gmail";

export async function GET() {
  await requireSession();
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // the return from Google is a top-level GET, which lax cookies accompany
    secure: process.env.NODE_ENV === "production",
    path: "/api/gmail",
    maxAge: 600,
  });
  return NextResponse.redirect(authUrl(state));
}
