import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {createAccountFixture} from './helpers/accounts';
import {getAiConfig} from '@/lib/ai-settings';
import {createSkillAction,saveAiConfigAction,importSkillAction,selectSkillsAction} from '@/app/app/settings/ai-actions';
vi.mock('@/lib/auth',()=>({requireSession:vi.fn()}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {requireSession} from '@/lib/auth';
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture();vi.mocked(requireSession).mockResolvedValue(f.owner);});afterEach(()=>f.cleanup());
it('rejects member management even with forged owner/model input',async()=>{
 const config=getAiConfig();vi.mocked(requireSession).mockResolvedValue(f.member);
 expect((await createSkillAction({filename:'x.md',body:'x'})).ok).toBe(false);
 expect((await saveAiConfigAction({...config,provider:'openai',model:'fake'})).ok).toBe(false);
 expect((await selectSkillsAction({...config,primarySkillId:config.primarySkillId,additionalSkillId:null})).ok).toBe(false);
 expect(getAiConfig()).toEqual(config);
});
it('supports owner Markdown creation/import and rejects invalid encoding',async()=>{
 expect((await createSkillAction({filename:'x.md',body:'Instructions'})).ok).toBe(true);
 const form=new FormData();form.set('file',new File(['Imported instructions'],'import.md',{type:'text/markdown'}));
 expect((await importSkillAction(form)).ok).toBe(true);
 form.set('file',new File([new Uint8Array([255])],'invalid.md'));
 expect((await importSkillAction(form)).ok).toBe(false);
});
