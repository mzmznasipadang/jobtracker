"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkEmail } from "./actions";

export function LinkEmail({ emailId, jobs }: { emailId: string; jobs: { id: number; label: string }[] }) {
  const [jobId, setJobId] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select value={jobId} onValueChange={setJobId}>
        <SelectTrigger className="w-56" aria-label="Job to link"><SelectValue placeholder="Link to a job…" /></SelectTrigger>
        <SelectContent>
          {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!jobId || pending}
        onClick={() => start(async () => {
          const r = await linkEmail(emailId, Number(jobId));
          if (r.ok) toast.success("Email linked");
          else toast.error(r.error);
        })}
      >
        Link
      </Button>
    </div>
  );
}
