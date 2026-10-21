import { z } from 'zod';
import type { Account } from './accounts';
import { MobileError } from './mobile-auth';
import { body, privateHeaders } from './mobile-api';
import { getDraft, generateDraft, saveDraft, finalizeDraft } from './tailor/drafts';
import { getTailored, getTailoredPdf, cvFilename } from './tailor/tailor';
import { MasterCv, type Job } from './types';
import { getMasterCv } from './cv/parse';
import { getTailorReadiness } from './job-readiness';
import { getAccountDb } from './db';
import { getJob } from './jobs';
import { isExpired } from './archive';
import { renderCoverLetterHtml } from './tailor/cv-html';
import { htmlToPdf } from './tailor/pdf';
const Edit = z.object({ cv: MasterCv, coverLetter: z.string().max(20000), answers: z.array(z.object({ question: z.string().max(20000), answer: z.string().max(20000) })).max(20) }).strict();
export async function handleDraft(account: Account, request: Request, job: Job) {
    if (request.method === 'GET')
        return { draft: getDraft(account, job.id), versions: getTailored(account, job.id) };
    if (job.archivedAt)
        throw new MobileError(409, 'Restore this job before editing its draft');
    if (request.method === 'POST') {
        const input = z.object({ questions: z.array(z.string().trim().min(1).max(1000)).max(20), expectedRevision: z.number().int().positive().nullable() }).strict().parse(await body(request));
        const readiness = getTailorReadiness(job, !!getMasterCv(account));
        if (!readiness.ready)
            throw new MobileError(400, readiness.reason!);
        if ((getDraft(account, job.id)?.revision ?? null) !== input.expectedRevision)
            throw new MobileError(409, 'Draft changed. Refresh before replacing.');
        void generateDraft(account, job.id, input.questions, input.expectedRevision).catch(() => { });
        return { ok: true };
    }
    const input = z.object({ revision: z.number().int().positive(), edit: Edit, reviewed: z.boolean().optional() }).strict().parse(await body(request));
    if (request.method === 'PATCH')
        return { draft: saveDraft(account, job.id, input.revision, input.edit) };
    if (request.method === 'PUT') {
        if (input.reviewed !== true)
            throw new MobileError(400, 'Confirm accuracy before generating PDFs');
        return finalizeDraft(account, job.id, input.revision, input.edit, true);
    }
    throw new MobileError(405, 'Method not allowed');
}
export async function handleDocument(account: Account, id: number, version: number, kind: string) {
    const job = getJob(account, id);
    if (!job || isExpired(job))
        throw new MobileError(404, 'Document not found');
    let pdf: Buffer, filename: string;
    if (kind === 'cv') {
        const found = getTailoredPdf(account, id, version);
        if (!found)
            throw new MobileError(404, 'Document not found');
        pdf = found.pdf;
        filename = cvFilename(found.name, job.company);
    }
    else if (kind === 'cover-letter') {
        const saved = getAccountDb(account).prepare('SELECT cv_json,cover_letter FROM tailored WHERE job_id=? AND version=?').get(id, version) as {
            cv_json: string;
            cover_letter: string;
        } | undefined;
        if (!saved?.cover_letter?.trim())
            throw new MobileError(404, 'Document not found');
        const cv = MasterCv.parse(JSON.parse(saved.cv_json));
        pdf = await htmlToPdf(renderCoverLetterHtml(cv.basics, saved.cover_letter));
        filename = cvFilename(cv.basics.name, job.company).replace(/-CV\.pdf$/, '-Cover-Letter.pdf');
    }
    else
        throw new MobileError(404, 'Document not found');
    const current = getJob(account, id);
    if (!current || isExpired(current))
        throw new MobileError(404, 'Document not found');
    return new Response(new Uint8Array(pdf), { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` } });
}
