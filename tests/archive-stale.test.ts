import {afterEach,expect,it,vi} from 'vitest';import {createAccountFixture} from './helpers/accounts';import {getAccountDb} from '@/lib/db';import {captureJob,getJob,retryExtraction} from '@/lib/jobs';import {archiveJob,restoreJob} from '@/lib/archive';import {askJson,AiError} from '@/lib/ai';
vi.mock('@/lib/ai',async orig=>({...await orig<typeof import('@/lib/ai')>(),askJson:vi.fn()}));vi.mock('@/lib/check/run',()=>({runChecks:vi.fn(async()=>{})}));
let f:ReturnType<typeof createAccountFixture>;afterEach(()=>f?.cleanup());
it('ignores an expired extraction error after archive, restore and a newer extraction',async()=>{
 f=createAccountFixture();let reject!:(e:unknown)=>void;vi.mocked(askJson).mockImplementationOnce(()=>new Promise((_r,no)=>{reject=no;}));
 const old=await captureJob(f.member,{url:'https://example.com/job',text:'Full posting'});getAccountDb(f.member).prepare("UPDATE jobs SET busy_since='2020-01-01T00:00:00Z'").run();archiveJob(f.member,old.id);restoreJob(f.member,old.id);
 const {JobFields}=await import('@/lib/types');vi.mocked(askJson).mockResolvedValueOnce(JobFields.parse({company:'New',companyDomain:null,title:'Role',location:null,workMode:null,employmentType:null,salaryMin:null,salaryMax:null,salaryCurrency:null,salaryPeriod:null,requirements:[],niceToHave:[],description:'Text',applyMethod:'site',applyEmail:null,applyUrl:null,recruiterEmail:null,language:'en'}));
 await retryExtraction(f.member,old.id);reject(new AiError('api','old failure'));await old.done;expect(getJob(f.member,old.id)).toMatchObject({company:'New',extractError:null,busy:null});
});
