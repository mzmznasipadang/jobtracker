"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { approveEmail, revokeAccount } from "@/lib/accounts";
type Result = { ok: true } | { ok: false; error: string };
export async function approveAccountAction(email: string): Promise<Result> {
  const account = await requireSession();
  if (account.role !== "owner") return { ok: false, error: "Only the owner can manage access" };
  try { approveEmail(z.string().parse(email)); }
  catch { return { ok: false, error: "Enter a valid Google account email" }; }
  revalidatePath("/app/settings");
  return { ok: true };
}
export async function revokeAccountAction(id: number): Promise<Result> {
  const account = await requireSession();
  if (account.role !== "owner") return { ok: false, error: "Only the owner can manage access" };
  try { revokeAccount(z.number().int().positive().parse(id)); }
  catch { return { ok: false, error: "Cannot revoke this account. The owner must retain access." }; }
  revalidatePath("/app/settings");
  return { ok: true };
}
