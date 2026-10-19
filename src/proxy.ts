import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// APP_URL keeps the Location on the public host behind cloudflared.
// Convenience redirect only; every action/route still calls requireSession().
export function proxy(req: NextRequest) {
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = new URL("/login", process.env.APP_URL || req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: "/app/:path*" };
