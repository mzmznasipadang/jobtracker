"use client";
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UsagePolicy, getUsageSummary, getModelPricing } from '@/lib/ai-usage';
import { saveUsagePolicyAction, savePricingAction } from './usage-actions';
type Summary = ReturnType<typeof getUsageSummary>;
function PolicyForm({ policy, label }: {
    policy: UsagePolicy;
    label: string;
}) {
    const [limit, setLimit] = useState(policy.limit === null ? '' : String(policy.limit)), [paused, setPaused] = useState(policy.paused), [inherit, setInherit] = useState(policy.inherit), [pending, start] = useTransition();
    return <form className="grid gap-3 rounded border p-3" onSubmit={e => { e.preventDefault(); start(async () => { const r = await saveUsagePolicyAction({ ...policy, limit: limit === '' ? null : Number(limit), paused, inherit }); if (r.ok)
        toast.success('Usage policy saved');
    else
        toast.error(r.error); }); }}>
 <p className="break-all text-sm font-medium">{label}</p>
 {policy.scope === 'account' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={inherit} onChange={e => setInherit(e.target.checked)}/>Use default allowance</label>}
 <label className="grid gap-2 text-sm">{policy.scope === 'month' ? 'Allowance for this UTC month' : 'Monthly request allowance'}<Input aria-label={`${label} allowance`} inputMode="numeric" type="number" min={0} step={1} disabled={policy.scope === 'account' && inherit} placeholder="Unlimited" value={limit} onChange={e => setLimit(e.target.value)}/></label>
 {policy.scope !== 'month' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)}/>{policy.scope === 'global' ? 'Pause AI for everyone' : 'Pause AI for this user'}</label>}
 <Button className="w-fit" variant="outline" disabled={pending}>Save allowance</Button>
 </form>;
}
function SummaryView({ summary }: {
    summary: Summary;
}) {
    const breakdown = new Map<string, number>();
    for (const row of summary.rows) {
        const key = `${row.provider} · ${row.model} · ${row.operation}`;
        breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }
    const tokens = summary.rows.reduce((total, row) => { if (row.usage)
        for (const n of Object.values(row.usage))
            if (n !== null)
                total += n; return total; }, 0);
    return <div className="grid gap-2 text-sm"><p>{summary.used} requests used · {summary.limit === null ? 'Unlimited allowance' : `${summary.remaining} remaining of ${summary.limit}`} {summary.paused ? '· AI paused' : ''}</p><p>Known reported tokens: {tokens.toLocaleString()} · {summary.unknownOutcomes} pending or unknown outcomes</p><p>{summary.costCoverage === summary.used && summary.used > 0 ? `Estimated USD $${summary.knownCostUsd.toFixed(6)}` : `Cost unavailable for ${summary.used - summary.costCoverage} of ${summary.used} requests. Known subtotal: USD $${summary.knownCostUsd.toFixed(6)}.`}</p><p className="text-xs text-muted-foreground">UTC month {summary.month} · resets {summary.periodEnd.slice(0, 10)} at 00:00 UTC. Provider billing is authoritative.</p>{[...breakdown].map(([name, n]) => <p className="break-words text-xs" key={name}>{name}: {n}</p>)}</div>;
}
export function UsageCard({ summary, admin }: {
    summary: Summary;
    admin?: {
        global: UsagePolicy;
        accounts: {
            email: string;
            summary: Summary;
            policy: UsagePolicy;
            override: UsagePolicy;
        }[];
        pricing: ReturnType<typeof getModelPricing>;
    };
}) {
    const [rates, setRates] = useState(admin?.pricing), [pending, start] = useTransition();
    return <Card><CardHeader><CardTitle>AI usage and allowances</CardTitle></CardHeader><CardContent className="grid gap-5">
 <SummaryView summary={summary}/><p className="text-xs text-muted-foreground">Each dispatched request counts, including failed responses. Editing drafts and generating PDFs do not use AI. Unknown token values are not counted as zero.</p>
 <form className="flex flex-wrap items-end gap-2" action="/app/settings"><label className="grid gap-2 text-sm">Usage month (UTC)<Input type="month" name="usageMonth" defaultValue={summary.month}/></label><Button variant="outline">View month</Button></form>
 {admin && <><PolicyForm key={`global:${admin.global.revision}`} policy={admin.global} label="Default for all users"/>
 {admin.accounts.map(a => <details className="rounded border p-3" key={a.summary.accountId}><summary className="cursor-pointer break-all text-sm font-medium">{a.email} · {a.summary.used} requests</summary><div className="mt-4 grid gap-3"><SummaryView summary={a.summary}/><PolicyForm key={`u:${a.policy.revision}`} policy={a.policy} label={a.email}/><PolicyForm key={`${a.override.month}:${a.override.revision}`} policy={a.override} label={`Override for ${a.summary.month}`}/></div></details>)}
 {rates && <details><summary className="cursor-pointer text-sm font-medium">Model pricing for cost estimates</summary><form className="mt-3 grid gap-3" onSubmit={e => { e.preventDefault(); start(async () => { const r = await savePricingAction(rates); if (r.ok) {
                setRates(r.pricing);
                toast.success('Pricing saved');
            }
            else
                toast.error(r.error); }); }}>
 <p className="break-words text-sm">{rates.provider} · {rates.model}. Rates are USD per million tokens. Blank means unknown. Old requests keep their original rates. These estimates do not enforce a dollar limit.</p>
 {(['normalInput', 'cachedInput', 'cacheWrite', 'output'] as const).map(key => <label className="grid gap-2 text-sm" key={key}>{({ normalInput: 'Normal input', cachedInput: 'Cached input', cacheWrite: 'Cache write', output: 'Output' })[key]}<Input type="number" step="any" min={0} value={rates[key] ?? ''} onChange={e => setRates({ ...rates, [key]: e.target.value === '' ? null : Number(e.target.value) })}/></label>)}<Button className="w-fit" disabled={pending}>Save model pricing</Button></form></details>}
 </>}
 </CardContent></Card>;
}
