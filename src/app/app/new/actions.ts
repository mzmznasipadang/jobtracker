"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { splitPasted } from "@/lib/bookmarklet";
import { requireSession } from "@/lib/auth";
import { captureJob } from "@/lib/jobs";

export type CaptureResult = { ok: false; error: string; needsText: boolean };

const Input = z.object({ url: z.string().max(2000), text: z.string().max(200_000) });

// Redirects to the job on success (extraction continues in the background); returns only failures.
export async function captureAction(input: { url: string; text: string }): Promise<CaptureResult> {
  const account = await requireSession();
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Input is too long", needsText: false };
  let { url, text } = parsed.data;
  if (!url.trim()) ({ url, text } = splitPasted(text)); // clipboard fallback: URL on the first line
  if (!/^https?:\/\//i.test(url.trim())) return { ok: false, error: "Enter a job URL starting with http:// or https://", needsText: false };

  let id: number;
  let duplicate = false;
  try {
    // `done` (extraction + checks) is deliberately not awaited.
    const result = await captureJob(account, { url, text: text.trim() || undefined });
    id = result.id; duplicate = !result.created;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("Could not fetch")) return { ok: false, error: "Could not read this page from the server. Paste its full description below, or use the bookmarklet.", needsText: true };
    return { ok: false, error: e instanceof TypeError ? "That does not look like a valid URL" : "Could not capture this job", needsText: false };
  }
  redirect(`/app/jobs/${id}${duplicate ? "?duplicate=1" : ""}`);
}
