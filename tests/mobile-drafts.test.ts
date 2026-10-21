import { beforeEach, afterEach, it, expect } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { createSession } from '@/lib/sessions';
import { GET, POST, PUT } from '@/app/api/mobile/v1/[...path]/route';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); getAccountDb(f.owner).prepare("INSERT INTO jobs(url,source,company,title,description) VALUES ('https://example.com/job','other','Acme','Engineer','Build')").run(); });
afterEach(() => f.cleanup());
function call(method: string, path: string, input?: unknown, member = false) { return { req: new Request('https://test/' + path, { method, headers: { Authorization: `Bearer ${createSession(member ? f.member : f.owner)}` }, body: input === undefined ? undefined : JSON.stringify(input) }), ctx: { params: Promise.resolve({ path: path.split('/') }) } }; }
it('returns existing empty draft without AI and denies foreign documents', async () => { let c = call('GET', 'jobs/1/draft'); const res = await GET(c.req, c.ctx); expect(res.status).toBe(200); expect(await res.json()).toEqual({ draft: null, versions: [] }); c = call('GET', 'jobs/1/documents/1/cv', undefined, true); expect((await GET(c.req, c.ctx)).status).toBe(404); });
it('rejects generation without master CV and finalization without review', async () => { let c = call('POST', 'jobs/1/draft', { questions: [], expectedRevision: null }); expect((await POST(c.req, c.ctx)).status).toBe(400); c = call('PUT', 'jobs/1/draft', { revision: 1, edit: {}, reviewed: false }); expect((await PUT(c.req, c.ctx)).status).toBe(400); });

it('preserves the existing saved draft when a stale device saves', async () => {
 const cv={basics:{name:'Test',email:'test@example.com',phone:'',location:'',links:[]},summary:'Current summary',experience:[],projects:[],education:[],skills:[],certifications:[],languages:[]};
 const stored={cv,master:cv,coverLetter:'Current letter',answers:[],language:'en',setup:{ai:{provider:'openai',model:'test'},primary:{filename:'resume.md'},additional:null}};
 getAccountDb(f.owner).prepare('INSERT INTO tailor_drafts(id,job_id,revision,data_json,updated_at) VALUES(?,?,?,?,?)').run('draft',1,2,JSON.stringify(stored),new Date().toISOString());
 const c=call('PATCH','jobs/1/draft',{revision:1,edit:{cv:{...cv,summary:'Stale edit'},coverLetter:'Old letter',answers:[]}});
 const {PATCH}=await import('@/app/api/mobile/v1/[...path]/route');
 expect((await PATCH(c.req,c.ctx)).status).toBe(409);
 const saved=getAccountDb(f.owner).prepare('SELECT data_json,revision FROM tailor_drafts WHERE job_id=1').get() as {data_json:string;revision:number};
 expect(saved.revision).toBe(2);expect(JSON.parse(saved.data_json).cv.summary).toBe('Current summary');
});
