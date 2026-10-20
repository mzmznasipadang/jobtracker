"use client";
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { Job } from '@/lib/types';
import { updateJobDetailsAction } from '@/app/app/jobs/[id]/actions';
export function JobDetailsEditor({ job, busy }: {
    job: Job;
    busy: boolean;
}) {
    const [company, setCompany] = useState(job.company), [title, setTitle] = useState(job.title), [location, setLocation] = useState(job.location ?? ''), [description, setDescription] = useState(job.description), [pending, start] = useTransition();
    return <details className="rounded-lg border p-4" open={!job.company || !job.title}>
 <summary className="cursor-pointer font-semibold">Review job details</summary>
 <form className="mt-4 grid gap-3" onSubmit={e => { e.preventDefault(); start(async () => { const r = await updateJobDetailsAction(job.id, { company, title, location: location || null, description, expectedUpdatedAt: job.updatedAt }); if (!r.ok)
        toast.error(r.error);
    else
        toast.success('Job details saved'); }); }}>
 <fieldset className="grid min-w-0 gap-3" disabled={busy || pending}><p className="text-sm text-muted-foreground">Check the company, title and full description before generating a draft. You can correct these without using AI.</p>
 <Label htmlFor="job-company">Company</Label><Input id="job-company" required maxLength={300} value={company} onChange={e => setCompany(e.target.value)}/>
 <Label htmlFor="job-title">Job title</Label><Input id="job-title" required maxLength={300} value={title} onChange={e => setTitle(e.target.value)}/>
 <Label htmlFor="job-location">Location</Label><Input id="job-location" maxLength={500} value={location} onChange={e => setLocation(e.target.value)}/>
 <Label htmlFor="job-description">Description</Label><Textarea id="job-description" required rows={8} maxLength={200000} value={description} onChange={e => setDescription(e.target.value)}/>
 <Button className="w-fit" disabled={busy || pending}>Confirm job details</Button>
 </fieldset></form></details>;
}
