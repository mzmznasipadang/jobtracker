import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Account } from '../accounts';
import { getAccountDb } from '../db';
import { getMasterCv } from '../cv/parse';
import { getTailorReadiness } from '../job-readiness';
import { isBusy, requireActiveJob, startJobWork } from '../jobs';
import { MasterCv } from '../types';
import type { TailorSetup } from '../cv-skills';
import { generateTailorContent, storeTailored } from './tailor';
import { renderCvHtml } from './cv-html';
import { htmlToPdf } from './pdf';
const Edit = z.object({ cv: MasterCv, coverLetter: z.string().max(20000), answers: z.array(z.object({ question: z.string().max(20000), answer: z.string().max(20000) })).max(20) });
export type DraftEdit = z.infer<typeof Edit>;
export type Draft = DraftEdit & {
    id: string;
    revision: number;
    master: z.infer<typeof MasterCv>;
    language: 'en' | 'id';
    generation: {
        provider: string;
        model: string;
        primary: string;
        additional: string | null;
    };
};
type Stored = Omit<Draft, 'id' | 'revision' | 'generation'> & {
    setup: TailorSetup;
};
function read(account: Account, jobId: number) {
    const r = getAccountDb(account).prepare('SELECT id,revision,data_json FROM tailor_drafts WHERE job_id=?').get(jobId) as {
        id: string;
        revision: number;
        data_json: string;
    } | undefined;
    return r ? { id: r.id, revision: r.revision, data: JSON.parse(r.data_json) as Stored } : null;
}
function publicDraft(r: NonNullable<ReturnType<typeof read>>): Draft {
    const { setup, ...data } = r.data;
    return { ...data, id: r.id, revision: r.revision, generation: { ...setup.ai, primary: setup.primary.filename, additional: setup.additional?.filename ?? null } };
}
export function getDraft(account: Account, jobId: number): Draft | null { const r = read(account, jobId); return r ? publicDraft(r) : null; }
async function leased<T>(account: Account, jobId: number, work: () => Promise<T>): Promise<T> {
    let result: T | undefined, error: unknown;
    await startJobWork(account, jobId, 'tailoring', async () => { try {
        result = await work();
    }
    catch (e) {
        error = e;
        throw e;
    } });
    if (error)
        throw error;
    return result as T;
}
export async function generateDraft(account: Account, jobId: number, questions: string[], expectedDraftRevision: number | null): Promise<Draft> {
    const job = requireActiveJob(account, jobId), master = getMasterCv(account);
    const readiness = getTailorReadiness(job, !!master);
    if (!readiness.ready)
        throw new Error(readiness.reason!);
    return leased(account, jobId, async () => {
        const prior = read(account, jobId);
        if ((prior?.revision ?? null) !== expectedDraftRevision)
            throw new Error('Draft changed. Refresh before replacing.');
        const { setup, tailored, out, lang } = await generateTailorContent(account, jobId, questions);
        const db = getAccountDb(account);
        return db.transaction(() => {
            requireActiveJob(account, jobId);
            const current = read(account, jobId);
            if ((current?.revision ?? null) !== expectedDraftRevision)
                throw new Error('Draft changed. Refresh.');
            const data: Stored = { cv: tailored, coverLetter: out.coverLetter, answers: out.answers, master: master!, language: lang, setup };
            db.prepare('INSERT INTO tailor_drafts(id,job_id,revision,data_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at').run(prior?.id ?? randomUUID(), jobId, (prior?.revision ?? 0) + 1, JSON.stringify(data), new Date().toISOString());
            return getDraft(account, jobId)!;
        }).immediate();
    });
}
function validatedEdit(value: DraftEdit, master: Draft['master']): DraftEdit {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 200000)
        throw new Error('Draft is too large');
    const edit = Edit.parse(value);
    function bounded(v: unknown): void { if (typeof v === 'string' && v.length > 20000)
        throw new Error('Draft text is too long'); if (Array.isArray(v))
        v.forEach(bounded);
    else if (v && typeof v === 'object')
        Object.values(v).forEach(bounded); }
    bounded(edit);
    // User wording is editable; identity, dates and source membership remain tied to the master snapshot.
    const cv = edit.cv;
    if (JSON.stringify({ ...cv, summary: master.summary, experience: master.experience, projects: master.projects, skills: master.skills }) !== JSON.stringify(master))
        throw new Error('Edit source facts in your master CV first');
    for (const key of ['experience', 'projects'] as const) {
        const seen = new Set<string>();
        for (const entry of cv[key]) {
            const source = master[key].find(e => e.id === entry.id);
            if (!source || seen.has(entry.id))
                throw new Error('Invalid source entry');
            seen.add(entry.id);
            if (JSON.stringify({ ...entry, bullets: source.bullets }) !== JSON.stringify(source))
                throw new Error('Edit source facts in your master CV first');
            const bullets = new Set<string>();
            for (const b of entry.bullets) {
                if (!source.bullets.some(s => s.id === b.id) || bullets.has(b.id))
                    throw new Error('Invalid source bullet');
                bullets.add(b.id);
            }
        }
    }
    const skills = new Set<string>();
    for (const skill of cv.skills) {
        if (!master.skills.some(s => JSON.stringify(s) === JSON.stringify(skill)) || skills.has(skill.id))
            throw new Error('Invalid source skill');
        skills.add(skill.id);
    }
    return edit;
}
function save(account: Account, jobId: number, expectedRevision: number, value: DraftEdit, allowBusy = false): Draft {
    const db = getAccountDb(account);
    return db.transaction(() => {
        const job = requireActiveJob(account, jobId);
        if (!allowBusy && isBusy(job))
            throw new Error('Wait for processing to finish');
        const r = read(account, jobId);
        if (!r)
            throw new Error('Generate a draft first');
        const edit = validatedEdit(value, r.data.master), same = JSON.stringify({ cv: r.data.cv, coverLetter: r.data.coverLetter, answers: r.data.answers }) === JSON.stringify(edit);
        if (r.revision !== expectedRevision && !same)
            throw new Error('Draft changed. Refresh before saving.');
        if (!same)
            db.prepare('UPDATE tailor_drafts SET revision=revision+1,data_json=?,updated_at=? WHERE job_id=?').run(JSON.stringify({ ...r.data, ...edit }), new Date().toISOString(), jobId);
        return getDraft(account, jobId)!;
    }).immediate();
}
export function saveDraft(account: Account, jobId: number, expectedRevision: number, edit: DraftEdit): Draft { return save(account, jobId, expectedRevision, edit); }
export async function finalizeDraft(account: Account, jobId: number, expectedRevision: number, edit: DraftEdit, reviewed: boolean): Promise<{
    version: number;
}> {
    if (reviewed !== true)
        throw new Error('Confirm you reviewed the draft for accuracy');
    requireActiveJob(account, jobId);
    return leased(account, jobId, async () => {
        const draft = save(account, jobId, expectedRevision, edit, true), db = getAccountDb(account);
        const prior = db.prepare('SELECT version FROM tailored WHERE draft_id=? AND draft_revision=?').get(draft.id, draft.revision) as {
            version: number;
        } | undefined;
        if (prior)
            return prior;
        const pdf = await htmlToPdf(renderCvHtml(draft.cv, draft.language));
        return db.transaction(() => {
            requireActiveJob(account, jobId);
            const stored = read(account, jobId)!;
            if (stored.revision !== draft.revision)
                throw new Error('Draft changed during rendering');
            return storeTailored(account, jobId, draft.cv, draft, draft.language, stored.data.setup, pdf, draft);
        }).immediate();
    });
}
