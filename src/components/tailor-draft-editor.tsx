"use client";
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { Draft, DraftEdit } from '@/lib/tailor/drafts';
import { renderCvHtml } from '@/lib/tailor/cv-html';
import { saveDraftAction, finalizeDraftAction } from '@/app/app/jobs/[id]/actions';
export function TailorDraftEditor({ jobId, draft, busy }: {
    jobId: number;
    draft: Draft;
    busy: boolean;
}) {
    const initial = { cv: draft.cv, coverLetter: draft.coverLetter, answers: draft.answers };
    const [edit, setEdit] = useState<DraftEdit>(initial), [saved, setSaved] = useState(JSON.stringify(initial)), [revision, setRevision] = useState(draft.revision), [reviewed, setReviewed] = useState(false), [pending, start] = useTransition();
    const dirty = JSON.stringify(edit) !== saved;
    useEffect(() => {
        if (!dirty)
            return;
        const unload = (e: BeforeUnloadEvent) => e.preventDefault();
        const click = (e: MouseEvent) => { const a = (e.target as Element)?.closest('a[href]'); if (a && !window.confirm('You have unsaved draft changes. Leave this page?')) {
            e.preventDefault();
            e.stopPropagation();
        } };
        window.addEventListener('beforeunload', unload);
        document.addEventListener('click', click, true);
        return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
    }, [dirty]);
    function change(next: DraftEdit) { setEdit(next); setReviewed(false); }
    const field = (label: string, value: string, onChange: (value: string) => void) => <div className="grid gap-2"><Label className="grid gap-2">{label}<Textarea aria-label={label} rows={4} maxLength={20000} value={value} onChange={e => onChange(e.target.value)}/></Label></div>;
    return <section className="grid min-w-0 gap-4 rounded-lg border p-4" aria-label="Application draft"><fieldset className="grid min-w-0 gap-4" disabled={pending || busy}>
 <div><h3 className="font-semibold">Review your application draft</h3><p className="break-words text-xs text-muted-foreground">{draft.generation.provider} · {draft.generation.model} · {draft.generation.primary}{draft.generation.additional ? ` + ${draft.generation.additional}` : ''}</p></div>
 <p role="status" className="text-sm">{dirty ? 'Unsaved changes' : 'Draft saved'} · revision {revision}</p>
 <p className="text-sm text-muted-foreground">Review all claims for accuracy. Wording is editable; change employers, dates and other source facts in your master CV, then generate a new draft.</p>
 <details open><summary className="cursor-pointer font-medium">CV summary {edit.cv.summary !== draft.master.summary ? '· changed' : ''}</summary>
 {field('CV summary', edit.cv.summary, v => change({ ...edit, cv: { ...edit.cv, summary: v } }))}<p className="mt-2 text-xs text-muted-foreground">Master: {draft.master.summary}</p></details>
 {(['experience', 'projects'] as const).map(key => <details key={key}><summary className="cursor-pointer font-medium capitalize">{key}</summary><div className="mt-3 grid gap-4">{draft.master[key].map(source => {
                const selected = edit.cv[key].find(e => e.id === source.id);
                return <div className="grid gap-3" key={source.id}><label className="flex gap-2 text-sm"><input type="checkbox" checked={!!selected} onChange={e => change({ ...edit, cv: { ...edit.cv, [key]: e.target.checked ? [...edit.cv[key], source] : edit.cv[key].filter(v => v.id !== source.id) } })}/>{'company' in source ? `${source.title} · ${source.company}` : source.name}</label>
 {selected && source.bullets.map(b => { const current = selected.bullets.find(v => v.id === b.id); return <div key={b.id} className="ml-3 grid gap-2 border-l pl-3"><label className="flex gap-2 text-xs"><input type="checkbox" checked={!!current} onChange={e => change({ ...edit, cv: { ...edit.cv, [key]: edit.cv[key].map(entry => entry.id === source.id ? { ...entry, bullets: e.target.checked ? [...entry.bullets, b] : entry.bullets.filter(v => v.id !== b.id) } : entry) } })}/>Include bullet {current && current.text !== b.text ? '· changed' : ''}</label>{current && field('Bullet wording', current.text, v => change({ ...edit, cv: { ...edit.cv, [key]: edit.cv[key].map(entry => entry.id === source.id ? { ...entry, bullets: entry.bullets.map(item => item.id === b.id ? { ...item, text: v } : item) } : entry) } }))}<p className="text-xs text-muted-foreground">Master: {b.text}</p></div>; })}</div>;
            })}</div></details>)}
 <details><summary className="cursor-pointer font-medium">Skills</summary><div className="mt-3 grid gap-2">{draft.master.skills.map(skill => <label className="flex gap-2 text-sm" key={skill.id}><input type="checkbox" checked={edit.cv.skills.some(s => s.id === skill.id)} onChange={e => change({ ...edit, cv: { ...edit.cv, skills: e.target.checked ? [...edit.cv.skills, skill] : edit.cv.skills.filter(s => s.id !== skill.id) } })}/>{skill.name}</label>)}</div></details>
 <details open><summary className="cursor-pointer font-medium">Cover letter · generated content</summary>{field('Cover letter', edit.coverLetter, v => change({ ...edit, coverLetter: v }))}</details>
 {edit.answers.map((answer, index) => <div key={index}>{field(answer.question, answer.answer, v => change({ ...edit, answers: edit.answers.map((a, i) => i === index ? { ...a, answer: v } : a) }))}</div>)}
 <details><summary className="cursor-pointer font-medium">Preview CV</summary><iframe title="CV preview" sandbox="" srcDoc={renderCvHtml(edit.cv, draft.language)} className="mt-3 h-[32rem] w-full min-w-0 rounded border bg-white"/></details>
 <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!dirty || pending || busy} onClick={() => start(async () => { const r = await saveDraftAction(jobId, revision, edit); if (!r.ok)
        toast.error(r.error);
    else {
        setRevision(r.draft.revision);
        setSaved(JSON.stringify(edit));
        toast.success('Draft saved');
    } })}>Save draft</Button></div>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I reviewed this draft and confirmed its accuracy.</label>
 <Button className="w-fit" disabled={!reviewed || pending || busy} onClick={() => start(async () => { const r = await finalizeDraftAction(jobId, revision, edit, reviewed); if (!r.ok)
        toast.error(r.error);
    else {
        setSaved(JSON.stringify(edit));
        toast.success(`PDF version ${r.version} generated`);
    } })}>{pending ? 'Working…' : 'Generate PDF'}</Button>
 </fieldset></section>;
}
