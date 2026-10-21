"use client";

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setEmailRelevance, type EmailRelevance } from './actions';

const labels = { unreviewed: 'Unreviewed', relevant: 'Relevant', not_relevant: 'Not relevant' };

export function EmailRelevanceControl({ emailId, relevance }: { emailId: string; relevance: EmailRelevance }) {
  const [value, setValue] = useState(relevance);
  const [pending, start] = useTransition();
  return <div className="grid gap-1" aria-busy={pending}>
    <Select value={value} disabled={pending} onValueChange={next => start(async () => {
      const result = await setEmailRelevance(emailId, next);
      if (!result.ok) toast.error(result.error);
      else { setValue(next as EmailRelevance); toast.success('Email relevance saved'); }
    })}>
      <SelectTrigger className="w-40" aria-label="Email relevance"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(labels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
    </Select>
    {pending && <span role="status" className="text-xs text-muted-foreground">Saving…</span>}
  </div>;
}

export function RelevanceFilter({ value }: { value: string }) {
  return <div className="grid gap-1.5">
    <Label htmlFor="relevance-filter">Relevance</Label>
    <Select name="relevance" defaultValue={value}>
      <SelectTrigger id="relevance-filter" className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All relevance</SelectItem>
        {Object.entries(labels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
