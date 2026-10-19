"use server";

import type { Account } from "@/lib/accounts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { runChecks } from "@/lib/check/run";
import { clearFollowUp } from "@/lib/ghost";
import { addNote, deleteJob, markRepliedElsewhere, retryExtraction, setStatus, startJobWork } from "@/lib/jobs";
import { tailorJob } from "@/lib/tailor/tailor";
import { Status } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

const Id = z.number().int().positive();

// requireSession redirects by throwing, so it stays outside the try.
async function run(fn: (account: Account) => unknown): Promise<Result> {
  const account = await requireSession();
  try {
    fn(account);
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Invalid input" : e instanceof Error ? e.message : "Something went wrong" };
  }
  revalidatePath("/app/jobs", "layout");
  return { ok: true };
}

// The work promises never reject and are deliberately not awaited (Cloudflare cuts requests at ~100 s).
export async function rerunChecks(id: number) {
  return run((account) => void startJobWork(account, Id.parse(id), "checking", () => runChecks(account, id)));
}

export async function tailorAction(id: number, questions: string[]) {
  return run((account) => {
    const qs = z.array(z.string().trim().min(1).max(1000)).max(20).parse(questions);
    void startJobWork(account, Id.parse(id), "tailoring", () => tailorJob(account, id, qs).then(() => {}));
  });
}

export async function retryExtractionAction(id: number, text?: string) {
  return run((account) => void retryExtraction(account, Id.parse(id), z.string().max(200_000).optional().parse(text)));
}

export async function setStatusAction(id: number, status: Status) {
  return run((account) => setStatus(account, Id.parse(id), Status.parse(status), "user"));
}

export async function repliedElsewhereAction(id: number) {
  return run((account) => markRepliedElsewhere(account, Id.parse(id)));
}

export async function addNoteAction(id: number, text: string) {
  return run((account) => addNote(account, Id.parse(id), z.string().trim().min(1).max(5000).parse(text)));
}

export async function clearFollowUpAction(id: number) {
  return run((account) => clearFollowUp(account, Id.parse(id)));
}

export async function deleteJobAction(id: number): Promise<Result> {
  const account = await requireSession();
  try {
    deleteJob(account, Id.parse(id));
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Invalid input" : e instanceof Error ? e.message : "Could not delete job" };
  }
  revalidatePath("/app/jobs");
  revalidatePath("/app");
  return { ok: true };
}
