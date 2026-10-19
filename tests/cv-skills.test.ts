import { afterEach,beforeEach,expect,it } from 'vitest';
import {createAccountFixture} from './helpers/accounts';
import {getAiConfig} from '@/lib/ai-settings';
import {createSkill,updateSkill,deleteSkill,listSkills,selectSkills,snapshotTailoring,decodeSkillUpload} from '@/lib/cv-skills';
let f:ReturnType<typeof createAccountFixture>;
beforeEach(()=>{f=createAccountFixture();});afterEach(()=>f.cleanup());
it('supports owner CRUD, rejects members and protects revisions/selected documents',()=>{
 getAiConfig(); const s=createSkill(f.owner,{filename:'extra.md',body:'Be concise'});
 expect(()=>createSkill(f.member,{filename:'bad.md',body:'x'})).toThrow();
 expect(()=>createSkill(f.owner,{filename:'EXTRA.md',body:'x'})).toThrow();
 const edited=updateSkill(f.owner,{...s,body:'More concise'});expect(edited.revision).toBe(s.revision+1);
 expect(()=>updateSkill(f.owner,{...s,body:'stale'})).toThrow(/changed|reload/i);
 let config=getAiConfig();selectSkills(f.owner,{primarySkillId:config.primarySkillId,additionalSkillId:s.id,revision:config.revision});
 const snapshot=snapshotTailoring();expect(snapshot.additional?.body).toBe('More concise');
 expect(()=>deleteSkill(f.owner,s.id,edited.revision)).toThrow(/selected|active/i);
 config=getAiConfig();expect(()=>selectSkills(f.owner,{primarySkillId:s.id,additionalSkillId:s.id,revision:config.revision})).toThrow();
 expect(getAiConfig()).toEqual(config);
 selectSkills(f.owner,{primarySkillId:config.primarySkillId,additionalSkillId:null,revision:config.revision});
 deleteSkill(f.owner,s.id,edited.revision);expect(listSkills(f.owner)).toHaveLength(1);
 expect(snapshot.additional?.body).toBe('More concise');
});
it('validates basename, UTF-8 and exact byte limits',()=>{
 for(const filename of ['../evil.md','x/y.md','x\\y.md','a..b.md','x.txt','\u0000.md',''])expect(()=>decodeSkillUpload(filename,new TextEncoder().encode('text'))).toThrow();
 expect(()=>decodeSkillUpload('x.md',new Uint8Array([255,254]))).toThrow();
 expect(()=>decodeSkillUpload('x.md',new TextEncoder().encode(' '.repeat(2)))).toThrow();
 expect(decodeSkillUpload('x.md',new Uint8Array(65536).fill(65)).body).toHaveLength(65536);
 expect(()=>decodeSkillUpload('x.md',new Uint8Array(65537).fill(65))).toThrow();
});
