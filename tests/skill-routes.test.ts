import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {createAccountFixture} from './helpers/accounts';
import {getAiConfig} from '@/lib/ai-settings';
import {GET} from '@/app/api/skills/[id]/route';
vi.mock('@/lib/auth',()=>({requireSession:vi.fn()}));import {requireSession} from '@/lib/auth';
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture();vi.mocked(requireSession).mockResolvedValue(f.owner);});afterEach(()=>f.cleanup());
it('exports Markdown only to owner with no-store and rejects member access',async()=>{
 const id=String(getAiConfig().primarySkillId),req=new Request('http://localhost/api/skills/'+id),args={params:Promise.resolve({id})};
 const res=await GET(req,args);expect(res.status).toBe(200);expect(res.headers.get('Content-Type')).toContain('text/markdown');expect(res.headers.get('Cache-Control')).toBe('no-store');expect(await res.text()).toContain('Tailoring');
 vi.mocked(requireSession).mockResolvedValue(f.member);expect((await GET(req,args)).status).toBe(403);
});
