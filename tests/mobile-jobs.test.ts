import { beforeEach, afterEach, it, expect } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { createSession } from '@/lib/sessions';
import { GET, PATCH, POST, DELETE } from '@/app/api/mobile/v1/[...path]/route';
let f: ReturnType<typeof createAccountFixture>, token: string;
beforeEach(() => { f = createAccountFixture(); token = createSession(f.owner); getAccountDb(f.owner).prepare("INSERT INTO jobs(url,source,company,title,description) VALUES ('https://example.com/job','other','Acme','Engineer','Build')").run(); });
afterEach(() => f.cleanup());
const call = (method: string, path: string, input?: unknown, t = token) => ({ request: new Request('https://test/api/mobile/v1/' + path, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) }), ctx: { params: Promise.resolve({ path: path.split('/') }) } });
it('requires a session and isolates identical numeric IDs between accounts', async () => {
    let c = call('GET', 'jobs');
    expect((await GET(c.request, c.ctx)).status).toBe(200);
    c = call('GET', 'jobs', undefined, 'bad');
    expect((await GET(c.request, c.ctx)).status).toBe(401);
    c = call('GET', 'jobs/1', undefined, createSession(f.member));
    expect((await GET(c.request, c.ctx)).status).toBe(404);
});
it('changes live status, validates input and archives/restores', async () => {
    let c = call('POST', 'jobs/1/actions', { action: 'status', status: 'applied' });
    expect((await POST(c.request, c.ctx)).status).toBe(200);
    expect(getAccountDb(f.owner).prepare('SELECT status FROM jobs WHERE id=1').get()).toEqual({ status: 'applied' });
    c = call('POST', 'jobs/1/actions', { action: 'status', status: 'wrong' });
    expect((await POST(c.request, c.ctx)).status).toBe(400);
    c = call('POST', 'jobs/1/actions', { action: 'archive' });
    expect((await POST(c.request, c.ctx)).status).toBe(200);
    c = call('GET', 'jobs');
    expect((await (await GET(c.request, c.ctx)).json()).jobs).toHaveLength(0);
    c = call('POST', 'jobs/1/actions', { action: 'restore' });
    expect((await POST(c.request, c.ctx)).status).toBe(200);
});
it('rejects stale details and expired archived resources', async () => {
    let c = call('PATCH', 'jobs/1', { company: 'New', title: 'Role', location: null, description: 'Updated', expectedUpdatedAt: 'stale' });
    expect((await PATCH(c.request, c.ctx)).status).toBe(409);
    getAccountDb(f.owner).prepare("UPDATE jobs SET archived_at='2020-01-01',purge_after='2020-02-01' WHERE id=1").run();
    c = call('GET', 'jobs/1');
    expect((await GET(c.request, c.ctx)).status).toBe(404);
    c = call('DELETE', 'jobs/2');
    expect((await DELETE(c.request, c.ctx)).status).toBe(404);
});

it('returns each account’s own content when job IDs overlap', async () => {
 getAccountDb(f.member).prepare("INSERT INTO jobs(url,source,company,title,description) VALUES ('https://example.com/member','other','Private Member Company','Designer','Design')").run();
 const c=call('GET','jobs/1',undefined,createSession(f.member));
 const response=await GET(c.request,c.ctx);
 expect(response.status).toBe(200);expect((await response.json()).job.company).toBe('Private Member Company');
 const own=call('GET','jobs/1');expect((await (await GET(own.request,own.ctx)).json()).job.company).toBe('Acme');
});
