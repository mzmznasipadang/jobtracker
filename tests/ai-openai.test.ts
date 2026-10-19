import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import type OpenAI from 'openai';
import {createAccountFixture} from './helpers/accounts';
import {askJson} from '@/lib/ai';
import {getAiConfig,saveAiSelection} from '@/lib/ai-settings';
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture();vi.stubEnv('OPENAI_API_KEY','fake');saveAiSelection(f.owner,{provider:'openai',model:'test-openai',revision:getAiConfig().revision});});
afterEach(()=>{f.cleanup();vi.unstubAllEnvs();});
const schema=z.object({n:z.number()});
function client(reply:unknown){const create=vi.fn(async(_req:Record<string,unknown>)=>reply);return {create,openai:{responses:{create}} as unknown as OpenAI};}
it('uses global OpenAI selection, structured output, PDF conversion and store:false',async()=>{
 const c=client({status:'completed',output_text:'{"n":1}',output:[]});
 expect(await askJson(f.member,{schema,system:'rules',content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:'cGRm'}},{type:'text',text:'Read'}]}, {openai:c.openai})).toEqual({n:1});
 const req=c.create.mock.calls[0][0] as Record<string,unknown>;
 expect(req).toMatchObject({model:'test-openai',store:false,max_output_tokens:16000,text:{format:{type:'json_schema',strict:true}}});
 expect(JSON.stringify(req.input)).toContain('data:application/pdf;base64,cGRm');
 expect(req).not.toHaveProperty('betas');expect(req).not.toHaveProperty('fallbacks');expect(req).not.toHaveProperty('reasoning');
});
it.each([
 [{status:'incomplete',output_text:'{}',output:[]},'unparseable'],
 [{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]},'refusal'],
 [{status:'completed',output_text:'{"n":"wrong"}',output:[]},'unparseable'],
 [{status:'completed',output_text:'bad json',output:[]},'unparseable'],
])('normalizes incomplete/refusal/invalid responses',async(reply,code)=>{
 const c=client(reply);await expect(askJson(f.owner,{schema,system:'x',content:'y'},{openai:c.openai})).rejects.toMatchObject({code});
});
it('rejects excessive output before making a request',async()=>{
 const c=client({});await expect(askJson(f.owner,{schema,system:'x',content:'y',maxTokens:16001},{openai:c.openai})).rejects.toThrow();expect(c.create).not.toHaveBeenCalled();
});
