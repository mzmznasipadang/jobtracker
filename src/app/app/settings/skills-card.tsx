"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { CvSkill } from "@/lib/cv-skills";
import type { AiConfig } from "@/lib/ai-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createSkillAction, updateSkillAction, deleteSkillAction, importSkillAction, selectSkillsAction } from "./ai-actions";
type Notice = {
    ok: boolean;
    text: string;
} | null;
function SkillSelection({ skills, config }: {
    skills: CvSkill[];
    config: AiConfig;
}) {
    const [pending, start] = useTransition(), [message, setMessage] = useState<Notice>(null);
    const router = useRouter();
    return <form className="grid gap-3 border-b border-border pb-6" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); start(async () => { const result = await selectSkillsAction({ primarySkillId: Number(form.get("primary")), additionalSkillId: form.get("additional") ? Number(form.get("additional")) : null, revision: config.revision }); setMessage({ ok: result.ok, text: result.ok ? "Selected skills saved" : result.error }); if (result.ok) {
        toast.success("Selected skills saved");
        router.refresh();
    } }); }}>
 <div className="grid gap-4 sm:grid-cols-2">{([['primary', 'Primary skill', String(config.primarySkillId)], ['additional', 'Additional skill', String(config.additionalSkillId ?? '')]] as const).map(([name, label, value]) => <div key={name} className="grid gap-1.5"><Label htmlFor={'skill-' + name}>{label}</Label><select id={'skill-' + name} name={name} defaultValue={value} disabled={pending} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm">{name === 'additional' && <option value="">None</option>}{skills.map(s => <option value={s.id} key={s.id}>{s.filename}</option>)}</select></div>)}</div>
 {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>{message.text}</p>}
 <Button type="submit" variant="outline" className="w-fit" disabled={pending}>{pending ? "Saving…" : "Save selected skills"}</Button></form>;
}
export function SkillsCard({ skills, config }: {
    skills: CvSkill[];
    config: AiConfig;
}) {
    const [draft, setDraft] = useState<Pick<CvSkill, 'id' | 'filename' | 'body' | 'revision'> | null>(null), [pending, start] = useTransition(), [message, setMessage] = useState<Notice>(null);
    const router = useRouter();
    const blank = () => { setDraft({ id: 0, filename: '', body: '', revision: 0 }); setMessage(null); };
    return <Card><CardHeader><CardTitle>CV instruction skills</CardTitle><CardDescription>One primary skill and an optional additional skill guide CVs, cover letters and form answers for everyone. Factual checks remain protected. These are writing instructions, not PDF layout code.</CardDescription></CardHeader>
 <CardContent className="space-y-6"><SkillSelection key={config.revision} skills={skills} config={config}/>
 <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end"><Button className="w-fit" type="button" onClick={blank} disabled={pending}>Create skill</Button><form className="flex min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row sm:items-end" onSubmit={e => { e.preventDefault(); const form = e.currentTarget, data = new FormData(form); start(async () => { const result = await importSkillAction(data); setMessage({ ok: result.ok, text: result.ok ? "Skill imported" : result.error }); if (result.ok) {
        setDraft(result.value);
        form.reset();
        router.refresh();
    } }); }}><div className="grid min-w-0 flex-1 gap-1.5"><Label htmlFor="import-skill">Import UTF-8 Markdown (maximum 64 KiB)</Label><Input id="import-skill" name="file" type="file" accept=".md,text/markdown" required disabled={pending}/></div><Button className="w-fit shrink-0" variant="outline" type="submit" disabled={pending}>Import skill</Button></form></div>
 <ul className="divide-y divide-border">{skills.map(s => { const selected = [config.primarySkillId, config.additionalSkillId].includes(s.id); return <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-all text-sm font-medium">{s.filename}</p><p className="text-xs text-muted-foreground">Revision {s.revision}{selected ? ' · selected' : ''}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} aria-label={`Edit ${s.filename}`} onClick={() => { setDraft({ ...s }); setMessage(null); }}>Edit</Button><Button size="sm" variant="ghost" asChild><a href={`/api/skills/${s.id}`}>Download</a></Button><Button size="sm" variant="ghost" disabled={pending || selected} title={selected ? 'Replace or clear this selection first' : undefined} aria-label={`Delete ${s.filename}`} onClick={() => start(async () => { const result = await deleteSkillAction(s.id, s.revision); setMessage({ ok: result.ok, text: result.ok ? 'Skill deleted' : result.error }); if (result.ok) {
        if (draft?.id === s.id)
            setDraft(null);
        router.refresh();
    } })}>Delete</Button></div></li>; })}</ul>
 {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>{message.text}</p>}
 {draft && <form className="grid gap-3 border-t border-border pt-6" onSubmit={e => { e.preventDefault(); start(async () => { const result = draft.id ? await updateSkillAction(draft) : await createSkillAction(draft); setMessage({ ok: result.ok, text: result.ok ? 'Skill saved' : result.error }); if (result.ok) {
        setDraft(result.value);
        router.refresh();
    } }); }}><h3 className="font-medium">{draft.id ? 'Edit skill' : 'New skill'}</h3><Label htmlFor="skill-filename">Markdown filename</Label><Input id="skill-filename" value={draft.filename} onChange={e => setDraft({ ...draft, filename: e.target.value })} placeholder="resume-tailor.md" maxLength={100} required disabled={pending}/><Label htmlFor="skill-body">Instructions</Label><Textarea id="skill-body" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={14} required disabled={pending}/><p className="text-xs text-muted-foreground">Maximum 64 KiB. For a conflicting edit, reload the list and select Edit again to read the latest saved revision. Unsaved text is kept when saving fails.</p><div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save skill'}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => router.refresh()}>Reload list</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>Close editor</Button></div></form>}
 </CardContent></Card>;
}
