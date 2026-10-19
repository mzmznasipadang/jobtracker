"use client";

import Link from "next/link";
import { useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { jobLabel, SalaryFitBadge, ScamBadge, ScoreBadge, STATUSES, statusLabel } from "@/components/job-status-badge";
import { setStatusAction } from "@/app/app/jobs/[id]/actions";
import type { Job, Status } from "@/lib/types";

export function JobCard({ job, busy }: { job: Job; busy: boolean }) {
  const [pending, start] = useTransition();
  const { company, title } = jobLabel(job, busy);
  const move = (s: Status) =>
    start(async () => {
      const r = await setStatusAction(job.id, s);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <Card className={`gap-2 p-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/app/jobs/${job.id}`} className="block truncate text-sm font-semibold text-primary hover:underline">{title}</Link>
          <p className="truncate text-xs text-muted-foreground">{company}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0" aria-label={`Move ${title}`}><MoreHorizontalIcon /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {STATUSES.filter((s) => s !== job.status).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => move(s)}>{statusLabel(s)}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs capitalize text-muted-foreground">{job.source}</span>
        <ScoreBadge score={job.matchScore} />
        <SalaryFitBadge fit={job.salaryFit} />
        <ScamBadge risk={job.scamRisk} />
        {job.followUpDue && (
          <span className="flex items-center gap-1 text-xs text-warning">
            <span className="size-2 rounded-full bg-warning" aria-hidden />Follow up
          </span>
        )}
      </div>
    </Card>
  );
}
