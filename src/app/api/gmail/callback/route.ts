import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { appUrl, exchangeCode, STATE_COOKIE } from "@/lib/email/gmail";
import { getKv, setKv } from "@/lib/settings";

export async function GET(req: NextRequest) {
  const account = await requireSession();
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/gmail" }); // path must match the one it was set with
  const state = req.nextUrl.searchParams.get("state");
  const [a, b] = [Buffer.from(expected ?? ""), Buffer.from(state ?? "")];
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("Invalid OAuth state", { status: 400 });

  const back = (result: string) => NextResponse.redirect(new URL(`/app/settings?gmail=${result}`, appUrl()));
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return back("denied");
  try {
    await exchangeCode(account, code);
  } catch (e) {
    // message only: a gaxios error object carries the request body, including the client secret
    console.error("Gmail code exchange failed:", e instanceof Error ? e.message : e);
    setKv(account, "gmailError", "Could not complete the Gmail connection — try again");
    return back("error");
  }
  return back(getKv(account, "gmailError") ? "error" : "connected");
}
