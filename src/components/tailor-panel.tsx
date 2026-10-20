"use client";
import type { Draft } from "@/lib/tailor/drafts";
import { TailorDraftEditor } from "./tailor-draft-editor";
import type { getEffectiveAiSummary } from "@/lib/cv-skills";
import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { tailorAction } from "@/app/app/jobs/[id]/actions";
import type { TailoredVersion } from "@/lib/tailor/tailor";
import { fmtDate } from "@/lib/utils";
function CopyButton({ text, label }: {
    text: string;
    label: string;
}) {
    const [done, setDone] = useState(false);
    return (<Button variant="outline" size="sm" aria-label={`Copy ${label}`} onClick={async () => {
            try {
                await navigator.clipboard.writeText(text);
                setDone(true);
                setTimeout(() => setDone(false), 1500);
            }
            catch {
                toast.error("Could not copy");
            }
        }}>
      {done ? <CheckIcon /> : <CopyIcon />}{done ? "Copied" : "Copy"}
    </Button>);
}
export function TailorPanel({ jobId, busy, versions, disabled, disabledReason, draft, effectiveAi }: {
    draft?: Draft | null;
    disabledReason?: string | null;
    effectiveAi: ReturnType<typeof getEffectiveAiSummary>;
    jobId: number;
    busy: boolean;
    versions: TailoredVersion[];
    disabled: boolean;
}) {
    const [questions, setQuestions] = useState("");
    const [pending, start] = useTransition();
    const working = busy || pending;
    return (<Card>
      <CardHeader>
        <CardTitle>Tailor</CardTitle>
        <CardDescription>Generate a draft, review and edit it, then create your CV PDF. Existing PDF versions stay available.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">New runs: {effectiveAi.provider} · {effectiveAi.model} · {effectiveAi.primary}{effectiveAi.additional ? ` + ${effectiveAi.additional}` : ""}</p>
        <div className="grid gap-1.5">
          <Label htmlFor="questions">Extra questions from the form</Label>
          <Textarea id="questions" rows={3} placeholder="One question per line" value={questions} onChange={(e) => setQuestions(e.target.value)}/>
        </div>
        {disabledReason && <p role="status" className="text-sm text-warning">{disabledReason}</p>}
        <Button className="w-fit" disabled={working || disabled} onClick={() => start(async () => {
            if (draft && !window.confirm("Replace your current draft? Existing PDF versions will stay available."))
                return;
            const r = await tailorAction(jobId, questions.split("\n").map((q) => q.trim()).filter(Boolean), draft?.revision ?? null);
            if (!r.ok)
                toast.error(r.error);
        })}>
          {working ? "Generating draft…" : draft ? "Replace draft" : "Generate draft"}
        </Button>
        {working && (<div role="status" className="grid gap-2">
            <p className="text-sm text-muted-foreground">Tailoring can take a minute. You can leave this page open.</p>
            <Skeleton className="h-4 w-2/3"/>
          </div>)}

        {draft && <TailorDraftEditor key={`${draft.id}:${draft.revision}`} jobId={jobId} draft={draft} busy={busy}/>}

        {versions.map((v, i) => (<section key={v.version} className="grid gap-3 rounded-lg border p-4" aria-label={`Version ${v.version}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Version {v.version}{i === 0 ? " (latest)" : ""} <span className="font-normal text-muted-foreground">· {fmtDate(v.createdAt)}</span></h3>
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/jobs/${jobId}/cv/${v.version}`}><DownloadIcon />CV (PDF)</a>
              </Button>
            </div>
            <p className="break-words text-xs text-muted-foreground">{v.generation ? `${v.generation.provider} · ${v.generation.model} · ${v.generation.primary.filename} r${v.generation.primary.revision}${v.generation.additional ? ` + ${v.generation.additional.filename} r${v.generation.additional.revision}` : ""}` : "Generation details unavailable for this older version"}</p>
            <p className="rounded-md bg-warning/15 px-3 py-2 text-sm font-medium text-warning">Review before sending</p>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Cover letter</h4><CopyButton text={v.coverLetter} label="cover letter"/></div>
              <p className="whitespace-pre-wrap text-sm">{v.coverLetter}</p>
            </div>
            {v.answers.map((a) => (<div key={a.question} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{a.question}</h4><CopyButton text={a.answer} label="answer"/></div>
                <p className="whitespace-pre-wrap text-sm">{a.answer}</p>
              </div>))}
          </section>))}
      </CardContent>
    </Card>);
}
