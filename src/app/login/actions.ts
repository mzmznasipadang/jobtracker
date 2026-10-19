"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeSession, SESSION_COOKIE } from "@/lib/sessions";
export async function logout(): Promise<void> {
  const jar = await cookies();
  revokeSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
