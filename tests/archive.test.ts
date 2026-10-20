import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { getJob, startJobWork } from '@/lib/jobs';
import { archiveJob, restoreJob, purgeExpiredJobs, isExpired } from '@/lib/archive';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); for (const a of [f.owner, f.member])
    getAccountDb(a).prepare("INSERT INTO jobs(url,source,company,title,status) VALUES('u','other','Acme','Role','applied')").run(); });
afterEach(() => f.cleanup());
it('restores before deadline, expires exactly at 30 days and purges only private job records', () => {
    const at = new Date('2026-10-20T00:00:00Z');
    archiveJob(f.member, 1, at);
    const job = getJob(f.member, 1)!;
    expect(Date.parse(job.purgeAfter!) - at.getTime()).toBe(30 * 86400000);
    expect(job.status).toBe('applied');
    restoreJob(f.member, 1, new Date(at.getTime() + 1));
    expect(getJob(f.member, 1)?.archivedAt).toBeNull();
    archiveJob(f.member, 1, at);
    expect(isExpired(getJob(f.member, 1)!, new Date(job.purgeAfter!))).toBe(true);
    expect(() => restoreJob(f.member, 1, new Date(job.purgeAfter!))).toThrow(/expired/);
    getAccountDb(f.member).prepare("INSERT INTO emails(id,job_id) VALUES('m',1)").run();
    expect(purgeExpiredJobs(f.member, new Date(job.purgeAfter!))).toBe(1);
    expect(purgeExpiredJobs(f.member, new Date(job.purgeAfter!))).toBe(0);
    expect(getJob(f.owner, 1)).not.toBeNull();
    expect(getAccountDb(f.member).prepare("SELECT job_id FROM emails").get()).toEqual({ job_id: null });
});
it('blocks archive during live processing and archived mutations', async () => {
    let finish!: () => void;
    const work = startJobWork(f.member, 1, 'tailoring', () => new Promise<void>(r => { finish = r; }));
    expect(() => archiveJob(f.member, 1)).toThrow(/processing/);
    finish();
    await work;
    archiveJob(f.member, 1);
    expect(() => startJobWork(f.member, 1, 'checking', async () => { })).toThrow(/archived/);
});
