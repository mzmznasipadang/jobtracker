import {afterEach,expect,it,vi} from 'vitest';import {createAccountFixture} from './helpers/accounts';import {getAccountDb} from '@/lib/db';import {archiveJob} from '@/lib/archive';import {runGhostDetection} from '@/lib/ghost';
let f:ReturnType<typeof createAccountFixture>;afterEach(()=>{vi.restoreAllMocks();f?.cleanup();});
it('skips a job archived after the worker selected it',()=>{
 f=createAccountFixture();const db=getAccountDb(f.member);db.prepare("INSERT INTO jobs(url,source,company,title,status,applied_at) VALUES('u','other','c','t','applied','2020-01-01T00:00:00Z')").run();
 const prepare=db.prepare.bind(db);vi.spyOn(db,'prepare').mockImplementation((sql:string)=>{const statement=prepare(sql);if(sql.startsWith('SELECT id, applied_at')){const all=statement.all.bind(statement);statement.all=(...args:unknown[])=>{const rows=all(...args);archiveJob(f.member,1);return rows;};}return statement;});
 expect(runGhostDetection(f.member)).toEqual({flagged:0,ghosted:0});expect(db.prepare('SELECT status,follow_up_due FROM jobs').get()).toEqual({status:'applied',follow_up_due:0});
});
