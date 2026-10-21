"use server";

import { getAccountDb } from "@/lib/db";
import { setKv } from "@/lib/settings";
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

export type EmailRelevance = 'unreviewed' | 'relevant' | 'not_relevant';

export async function setEmailRelevance(emailId: string, value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await requireSession();
  try {
    const id = z.string().min(1).max(200).parse(emailId);
    const relevance = z.enum(['unreviewed', 'relevant', 'not_relevant']).parse(value);
    const db = getAccountDb(account);
    db.transaction(() => {
      const email = db.prepare(`SELECT e.id, j.purge_after FROM emails e
        LEFT JOIN jobs j ON j.id=e.job_id WHERE e.id=?`).get(id) as { id: string; purge_after: string | null } | undefined;
      if (!email || (email.purge_after && Date.parse(email.purge_after) <= Date.now()))
        throw new Error('Email not found');
      if (relevance === 'unreviewed') db.prepare('DELETE FROM kv WHERE key=?').run(`emailRelevance:${id}`);
      else setKv(account, `emailRelevance:${id}`, relevance);
    }).immediate();
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? 'Invalid input' : e instanceof Error ? e.message : 'Could not save relevance' };
  }
  revalidatePath('/app/inbox');
  return { ok: true };
}
