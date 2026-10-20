import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createAccountFixture} from './helpers/accounts';
import {getAccountDb} from '@/lib/db';import {saveMasterCv} from '@/lib/cv/parse';
import {generateDraft,saveDraft,finalizeDraft} from '@/lib/tailor/drafts';
import {askJson} from '@/lib/ai';import {htmlToPdf} from '@/lib/tailor/pdf';
vi.mock('@/lib/ai',async orig=>({...await orig<typeof import('@/lib/ai')>(),askJson:vi.fn()}));
vi.mock('@/lib/tailor/pdf',()=>({htmlToPdf:vi.fn(async()=>Buffer.from('%PDF test'))}));
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture();getAccountDb(f.member).prepare("INSERT INTO jobs(url,source,company,title,description) VALUES ('u','other','Acme','Role','Posting')").run();saveMasterCv(f.member,{basics:{name:'A',email:'',phone:'',location:'',links:[]},summary:'Real',experience:[],projects:[],education:[],skills:[],certifications:[],languages:[]});vi.mocked(askJson).mockResolvedValue({summary:'Draft',experience:[],projects:[],skillIds:[],coverLetter:'Letter',answers:[]});vi.mocked(htmlToPdf).mockClear();});afterEach(()=>f.cleanup());
it('creates no PDF until reviewed, saves wording, rejects conflicts and finalizes idempotently',async()=>{
 const d=await generateDraft(f.member,1,[],null);expect(htmlToPdf).not.toHaveBeenCalled();
 const edit={cv:{...d.cv,summary:'My reviewed wording'},coverLetter:d.coverLetter,answers:d.answers};
 const saved=saveDraft(f.member,1,d.revision,edit);expect(saved.cv.summary).toBe('My reviewed wording');
 expect(()=>saveDraft(f.member,1,d.revision,{...edit,coverLetter:'conflict'})).toThrow(/changed/);
 await expect(finalizeDraft(f.member,1,saved.revision,edit,false)).rejects.toThrow(/review/);
 expect(await finalizeDraft(f.member,1,saved.revision,edit,true)).toEqual({version:1});
 expect(await finalizeDraft(f.member,1,saved.revision,edit,true)).toEqual({version:1});expect(htmlToPdf).toHaveBeenCalledTimes(1);
 expect(()=>saveDraft(f.member,1,saved.revision,{...edit,cv:{...edit.cv,basics:{...edit.cv.basics,name:'Fake'}}})).toThrow(/source/);
 expect(getAccountDb(f.owner).prepare('SELECT count(*) n FROM tailor_drafts').get()).toEqual({n:0});
});
it('retains a draft when replacement or rendering fails',async()=>{
 const d=await generateDraft(f.member,1,[],null);vi.mocked(askJson).mockRejectedValueOnce(new Error('provider failed'));
 await expect(generateDraft(f.member,1,[],d.revision)).rejects.toThrow('provider failed');
 vi.mocked(htmlToPdf).mockRejectedValueOnce(new Error('render failed'));
 await expect(finalizeDraft(f.member,1,d.revision,{cv:d.cv,coverLetter:d.coverLetter,answers:d.answers},true)).rejects.toThrow('render failed');
 expect(getAccountDb(f.member).prepare('SELECT count(*) n FROM tailor_drafts').get()).toEqual({n:1});
});
