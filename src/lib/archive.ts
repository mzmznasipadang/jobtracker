import type { Account } from './accounts';
import { getAccountDb } from './db';
import { getJob, isBusy } from './jobs';
import type { Job } from './types';
export function isExpired(job: Pick<Job, 'purgeAfter'>, now = new Date()): boolean { return !!job.purgeAfter && Date.parse(job.purgeAfter) <= now.getTime(); }
export function archiveJob(account: Account, id: number, now = new Date()): void {
    const db = getAccountDb(account);
    db.transaction(() => {
        const job = getJob(account, id);
        if (!job)
            throw new Error('Job not found');
        if (job.archivedAt)
            throw new Error('Job is already archived');
        if (isBusy(job))
            throw new Error('Wait for processing to finish');
        db.prepare('UPDATE jobs SET archived_at=?,purge_after=?,updated_at=?,busy=NULL,busy_since=NULL,busy_token=NULL WHERE id=?').run(now.toISOString(), new Date(now.getTime() + 30 * 86400000).toISOString(), now.toISOString(), id);
    }).immediate();
}
export function restoreJob(account: Account, id: number, now = new Date()): void {
    const db = getAccountDb(account);
    db.transaction(() => {
        const job = getJob(account, id);
        if (!job)
            throw new Error('Job not found');
        if (!job.archivedAt)
            throw new Error('Job is not archived');
        if (isExpired(job, now))
            throw new Error('The restore period has expired');
        db.prepare('UPDATE jobs SET archived_at=NULL,purge_after=NULL,updated_at=? WHERE id=?').run(now.toISOString(), id);
    }).immediate();
}
export function purgeExpiredJobs(account: Account, now = new Date()): number {
    return getAccountDb(account).prepare('DELETE FROM jobs WHERE purge_after IS NOT NULL AND purge_after<=?').run(now.toISOString()).changes;
}
