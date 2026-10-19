"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { linkEmail as link } from "@/lib/email/sync";

// requireSession redirects by throwing, so it stays outside the try.
export async function linkEmail(emailId: string, jobId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await requireSession();
  try {
    link(account, z.string().min(1).parse(emailId), z.number().int().positive().parse(jobId));
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}
