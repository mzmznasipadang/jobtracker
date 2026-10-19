"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { SalaryFitBadge, ScamBadge, ScoreBadge } from "@/components/job-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { rerunChecks } from "@/app/app/jobs/[id]/actions";
import type { Job } from "@/lib/types";

const SALARY_NOTE: Record<NonNullable<Job["salaryFit"]>, string> = {
  ok: "The range reaches your expected salary.",
  above_range: "The top of the range clears your minimum but not your expected salary. Negotiate or lower your ask.",
  below_minimum: "The top of the range is below your minimum. Hard mismatch.",
  unknown: "No range listed. Ask about pay early.",
};

const parse = <T,>(json: string | null): Partial<T> => {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
};

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export function CheckPanel({ job, busy }: { job: Job; busy: boolean }) {
  const [pending, start] = useTransition();
  const working = busy || pending;
  const match = parse<{ reasons: string[]; gaps: string[]; missingKeywords: string[]; dealBreakerHit: string | null; reason: string }>(job.matchJson);
  const scam = parse<{ reasons: string[] }>(job.scamJson);
  const salary = job.salaryMin != null || job.salaryMax != null
    ? `${[job.salaryMin, job.salaryMax].filter((n) => n != null).map((n) => n!.toLocaleString("en-US")).join(" – ")} ${job.salaryCurrency ?? ""}${job.salaryPeriod ? ` / ${job.salaryPeriod}` : ""}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checks</CardTitle>
        <CardDescription>Match against your master CV and preferences, salary fit and scam risk.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {working ? (
          <div role="status" className="grid gap-2">
            <p className="text-sm text-muted-foreground">{job.busy === "extracting" ? "Reading the posting, then running checks…" : "Running checks…"}</p>
            <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" />
          </div>
        ) : job.matchScore == null && !job.scamRisk ? (
          <p className="text-sm text-muted-foreground">No checks yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ScoreBadge score={job.matchScore} />
              {job.matchScore == null && <span className="text-sm text-muted-foreground">No match score: upload your master CV in Settings.</span>}
              <SalaryFitBadge fit={job.salaryFit} />
              <ScamBadge risk={job.scamRisk} always />
            </div>
            {match.dealBreakerHit && <p className="text-sm font-medium text-danger">Deal-breaker: {match.dealBreakerHit}</p>}
            <List title="Why it matches" items={match.reasons} />
            <List title="Gaps" items={match.gaps} />
            {!!match.missingKeywords?.length && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Missing keywords</h3>
                <p className="text-sm">{match.missingKeywords.join(", ")}</p>
              </div>
            )}
            {job.salaryFit && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Salary{salary ? `: ${salary}` : ""}</h3>
                <p className="text-sm">{SALARY_NOTE[job.salaryFit]}</p>
              </div>
            )}
            <List title="Scam risk reasons" items={scam.reasons} />
          </>
        )}
        <Button
          variant="secondary"
          className="w-fit"
          disabled={working || !!job.extractError}
          onClick={() => start(async () => {
            const r = await rerunChecks(job.id);
            if (!r.ok) toast.error(r.error);
          })}
        >
          Re-run checks
        </Button>
      </CardContent>
    </Card>
  );
}
