import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { archiveJob } from '@/lib/archive';
import { GET } from '@/app/api/jobs/[id]/cv/[version]/route';
import { requireSession } from '@/lib/auth';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); vi.mocked(requireSession).mockResolvedValue(f.member); getAccountDb(f.member).prepare("INSERT INTO jobs(url,source,company,title) VALUES('u','other','c','t')").run(); getAccountDb(f.member).prepare("INSERT INTO tailored(job_id,version,cv_json,pdf) VALUES(1,1,?,?)").run(JSON.stringify({ basics: { name: 'Member' } }), Buffer.from('%PDF test')); });
afterEach(() => f.cleanup());
it('allows private archived downloads but rejects expired output before worker purge', async () => {
    const req = new Request('https://test/api/jobs/1/cv/1'), args = { params: Promise.resolve({ id: '1', version: '1' }) };
    archiveJob(f.member, 1);
    expect((await GET(req, args)).status).toBe(200);
    getAccountDb(f.member).prepare("UPDATE jobs SET purge_after='2020-01-01T00:00:00Z'").run();
    expect((await GET(req, args)).status).toBe(404);
    vi.mocked(requireSession).mockResolvedValue(f.owner);
    expect((await GET(req, args)).status).toBe(404);
});
