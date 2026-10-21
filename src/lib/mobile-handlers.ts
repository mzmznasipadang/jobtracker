import { z } from 'zod';
import type { Account } from './accounts';
import { body, positiveId } from './mobile-api';
import { MobileError } from './mobile-auth';
import { getJob, listJobs, listEvents, captureJob, updateJobDetails, deleteJob, setStatus, addNote, startJobWork, retryExtraction, markRepliedElsewhere } from './jobs';
import { archiveJob, restoreJob, isExpired } from './archive';
import { Status, Source } from './types';
import { computeMetrics } from './metrics';
import { getMasterCv } from './cv/parse';
import { getTailorReadiness } from './job-readiness';
import { runChecks } from './check/run';
import { clearFollowUp } from './ghost';
import { handleDraft, handleDocument } from './mobile-drafts';
import { handleSettings } from './mobile-settings';
const Id = z.number().int().positive();
const Action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('status'), status: Status }).strict(),
    z.object({ action: z.literal('note'), text: z.string().trim().min(1).max(5000) }).strict(),
    z.object({ action: z.literal('retry'), text: z.string().max(200000).optional(), replaceEdited: z.boolean().default(false) }).strict(),
    ...(['checks', 'replied', 'followup', 'archive', 'restore'] as const).map(action => z.object({ action: z.literal(action) }).strict()),
]);
export async function handleMobile(account: Account, request: Request, path: string[]): Promise<unknown> {
    const key = path.join('/'), method = request.method, url = new URL(request.url);
    if (key === 'dashboard' && method === 'GET')
        return { metrics: computeMetrics(account), jobs: listJobs(account).filter(j => !j.archivedAt) };
    if (path[0] !== 'jobs')
        return handleSettings(account, request, path);
    if (path.length === 1) {
        if (method === 'GET') {
            const status = url.searchParams.get('status'), source = url.searchParams.get('source'), archive = url.searchParams.get('archive') === 'true';
            return { jobs: listJobs(account, { status: status ? Status.parse(status) : undefined, source: source ? Source.parse(source) : undefined }).filter(j => !isExpired(j) && !!j.archivedAt === archive) };
        }
        if (method === 'POST') {
            const input = z.object({ url: z.url().max(2000).refine(v => /^https?:\/\//.test(v)), text: z.string().max(200000).optional() }).strict().parse(await body(request));
            const result = await captureJob(account, input);
            return { id: result.id, created: result.created };
        }
    }
    const id = Id.parse(positiveId(path[1] ?? '')), job = getJob(account, id);
    if (!job || isExpired(job))
        throw new MobileError(404, 'Job not found');
    if (path[2] === 'documents' && path.length === 5 && method === 'GET')
        return handleDocument(account, id, positiveId(path[3]), path[4]);
    if (path[2] === 'draft' && path.length === 3)
        return handleDraft(account, request, job);
    if (path.length === 2) {
        if (method === 'GET')
            return { job, events: listEvents(account, id), readiness: getTailorReadiness(job, !!getMasterCv(account)) };
        if (method === 'PATCH') {
            const input = z.object({ company: z.string(), title: z.string(), location: z.string().nullable(), description: z.string(), expectedUpdatedAt: z.string() }).strict().parse(await body(request));
            updateJobDetails(account, id, input);
            return { job: getJob(account, id) };
        }
        if (method === 'DELETE') {
            deleteJob(account, id);
            return { ok: true };
        }
    }
    if (path[2] === 'actions' && path.length === 3 && method === 'POST') {
        const input = Action.parse(await body(request));
        switch (input.action) {
            case 'status':
                setStatus(account, id, input.status, 'user');
                break;
            case 'note':
                addNote(account, id, input.text);
                break;
            case 'checks':
                void startJobWork(account, id, 'checking', () => runChecks(account, id));
                break;
            case 'retry':
                void retryExtraction(account, id, input.text, input.replaceEdited);
                break;
            case 'replied':
                markRepliedElsewhere(account, id);
                break;
            case 'followup':
                clearFollowUp(account, id);
                break;
            case 'archive':
                archiveJob(account, id);
                break;
            case 'restore':
                restoreJob(account, id);
                break;
        }
        return { job: getJob(account, id) };
    }
    throw new MobileError(404, 'Endpoint not found');
}
