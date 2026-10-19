import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAiConfig, saveAiSelection } from '@/lib/ai-settings';
import { saveSettings } from '@/lib/settings';
import { getRegistry } from '@/lib/accounts';
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture(); vi.stubEnv('ANTHROPIC_API_KEY','fake'); vi.stubEnv('OPENAI_API_KEY','fake');});
afterEach(()=>{f.cleanup();vi.unstubAllEnvs();});
it('initializes once from owner model, ignoring member overrides',()=>{
 saveSettings(f.owner,{aiModel:'owner-model'});saveSettings(f.member,{aiModel:'member-model'});
 expect(getAiConfig()).toMatchObject({provider:'anthropic',model:'owner-model',additionalSkillId:null});
 const config=getAiConfig(); expect(getAiConfig()).toEqual(config);
 expect(getRegistry().prepare('SELECT count(*) AS n FROM cv_skills').get()).toEqual({n:1});
});
it('only owner can change global provider and stale/missing-key changes preserve settings',()=>{
 const config=getAiConfig();
 expect(()=>saveAiSelection(f.member,{provider:'openai',model:'test-model',revision:config.revision})).toThrow();
 expect(saveAiSelection(f.owner,{provider:'openai',model:'test-model',revision:config.revision})).toMatchObject({provider:'openai',model:'test-model'});
 expect(()=>saveAiSelection(f.owner,{provider:'anthropic',model:'x',revision:config.revision})).toThrow(/changed|reload/i);
 vi.stubEnv('ANTHROPIC_API_KEY',''); const now=getAiConfig();
 expect(()=>saveAiSelection(f.owner,{provider:'anthropic',model:'x',revision:now.revision})).toThrow(/key/i);
 expect(getAiConfig()).toEqual(now);
});
