import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { getJob, updateJobDetails, retryExtraction } from '@/lib/jobs';
import { getTailorReadiness } from '@/lib/job-readiness';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); for (const a of [f.owner, f.member])
    getAccountDb(a).prepare("INSERT INTO jobs(url,source,company,title,extract_error) VALUES ('https://example.com','other','','','failed')").run(); });
afterEach(() => f.cleanup());
it('validates manual details, isolates accounts and rejects stale or destructive retries', () => {
    const before = getJob(f.member, 1)!;
    expect(getTailorReadiness(before, true).ready).toBe(false);
    updateJobDetails(f.member, 1, { company: 'Acme', title: 'Role', location: null, description: 'Full posting', expectedUpdatedAt: before.updatedAt });
    const job = getJob(f.member, 1)!;
    expect(job.extractError).toBeNull();
    expect(job.detailsEditedAt).not.toBeNull();
    expect(getJob(f.owner, 1)?.company).toBe('');
    expect(getTailorReadiness(job, true).ready).toBe(true);
    expect(getTailorReadiness(job, false).reason).toContain('CV');
    expect(() => updateJobDetails(f.member, 1, { company: 'New', title: 'Role', location: null, description: 'Full', expectedUpdatedAt: 'old' })).toThrow(/changed/);
    expect(() => retryExtraction(f.member, 1)).toThrow(/replace/);
});
