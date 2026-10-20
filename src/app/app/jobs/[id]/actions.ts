"use server";
import {archiveJob,restoreJob} from "@/lib/archive";
import {getDraft} from "@/lib/tailor/drafts";
import {getTailorReadiness} from "@/lib/job-readiness";
import {getMasterCv} from "@/lib/cv/parse";
import {requireActiveJob} from "@/lib/jobs";

import type { Account } from "@/lib/accounts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { runChecks } from "@/lib/check/run";
import { clearFollowUp } from "@/lib/ghost";
import { addNote, deleteJob, updateJobDetails, markRepliedElsewhere, retryExtraction, setStatus, startJobWork } from "@/lib/jobs";
import {generateDraft,saveDraft,finalizeDraft,type DraftEdit} from "@/lib/tailor/drafts";
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

export async function tailorAction(id:number,questions:string[],expectedRevision:number|null=null) {
 const account=await requireSession();
 try {
  const qs=z.array(z.string().trim().min(1).max(1000)).max(20).parse(questions);
  const ready=getTailorReadiness(requireActiveJob(account,Id.parse(id)),!!getMasterCv(account));if(!ready.ready)throw new Error(ready.reason!);
  if((getDraft(account,id)?.revision??null)!==expectedRevision)throw new Error("Draft changed. Refresh before replacing.");
  const revision=z.number().int().positive().nullable().parse(expectedRevision);
  void generateDraft(account,Id.parse(id),qs,revision).catch(()=>{});
 } catch(e) {return {ok:false as const,error:e instanceof Error?e.message:'Could not generate draft'};}
 revalidatePath('/app/jobs','layout');return {ok:true as const};
}
export async function saveDraftAction(id:number,revision:number,edit:DraftEdit) {
 const account=await requireSession();
 try {const draft=saveDraft(account,Id.parse(id),z.number().int().positive().parse(revision),edit);revalidatePath('/app/jobs','layout');return {ok:true as const,draft};}
 catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Could not save draft'};}
}
export async function finalizeDraftAction(id:number,revision:number,edit:DraftEdit,reviewed:boolean) {
 const account=await requireSession();
 try {
  const result=await finalizeDraft(account,Id.parse(id),z.number().int().positive().parse(revision),edit,z.boolean().parse(reviewed));
  revalidatePath('/app/jobs','layout');return {ok:true as const,...result};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Could not generate PDF'};}
}

export async function retryExtractionAction(id: number, text?: string, replaceEdited = false) {
  return run((account) => void retryExtraction(account, Id.parse(id), z.string().max(200_000).optional().parse(text), z.boolean().parse(replaceEdited)));
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

export async function updateJobDetailsAction(id:number,input:Parameters<typeof updateJobDetails>[2]) {
 return run(account=>updateJobDetails(account,Id.parse(id),input));
}

export async function archiveJobAction(id:number){return run(account=>archiveJob(account,Id.parse(id)));}
export async function restoreJobAction(id:number){return run(account=>restoreJob(account,Id.parse(id)));}
