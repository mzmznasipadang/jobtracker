import { beforeEach, afterEach, it, expect } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { createSession } from '@/lib/sessions';
import { GET, PATCH, POST } from '@/app/api/mobile/v1/[...path]/route';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); });
afterEach(() => f.cleanup());
function call(method: string, path: string, input?: unknown, member = false) { return { req: new Request('https://test/' + path, { method, headers: { Authorization: `Bearer ${createSession(member ? f.member : f.owner)}` }, body: input === undefined ? undefined : JSON.stringify(input) }), ctx: { params: Promise.resolve({ path: path.split('/') }) } }; }
it('saves shared settings without exposing Gmail tokens or environment keys', async () => { let c = call('PATCH', 'settings', { profile: { name: 'Victor' } }); expect((await PATCH(c.req, c.ctx)).status).toBe(200); c = call('GET', 'settings'); const result = await GET(c.req, c.ctx); expect(result.status).toBe(200); const value = await result.json(); expect(value.settings.profile.name).toBe('Victor'); expect(JSON.stringify(value)).not.toMatch(/refresh_token|gmailToken|APP_SECRET/); });
it('blocks member administration and accepts only known settings fields', async () => { let c = call('GET', 'admin/accounts', undefined, true); expect((await GET(c.req, c.ctx)).status).toBe(403); c = call('PATCH', 'settings', { gmailToken: 'evil' }); expect((await PATCH(c.req, c.ctx)).status).toBe(400); });
it('returns inbox and master CV, rejects missing CV text', async () => { let c = call('GET', 'inbox'); expect((await GET(c.req, c.ctx)).status).toBe(200); c = call('GET', 'master-cv'); expect((await (await GET(c.req, c.ctx)).json()).cv).toBeNull(); c = call('POST', 'master-cv', { text: '' }); expect((await POST(c.req, c.ctx)).status).toBe(400); });
