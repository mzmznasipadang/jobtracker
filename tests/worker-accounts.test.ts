import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { approveEmail, revokeAccount } from '@/lib/accounts';
import { runAccountCycle } from '@/worker/cycle';
import { syncInbox } from '@/lib/email/sync';
import { runGhostDetection } from '@/lib/ghost';
vi.mock('@/lib/email/sync',()=>({syncInbox:vi.fn()}));
vi.mock('@/lib/ghost',()=>({runGhostDetection:vi.fn()}));
let f: ReturnType<typeof createAccountFixture>;
beforeEach(()=>{ f=createAccountFixture(); vi.clearAllMocks(); vi.mocked(syncInbox).mockResolvedValue({stored:0,skipped:0}); vi.mocked(runGhostDetection).mockReturnValue({flagged:0,ghosted:0}); vi.spyOn(console,'log').mockImplementation(()=>{}); vi.spyOn(console,'error').mockImplementation(()=>{}); });
afterEach(()=>{ f.cleanup(); vi.restoreAllMocks(); });
it('processes active accounts sequentially and excludes unused approvals',async()=>{
 approveEmail('unused@gmail.com');
 let inFlight=0;
 vi.mocked(syncInbox).mockImplementation(async()=>{ expect(inFlight).toBe(0); inFlight++; await Promise.resolve(); inFlight--; return {stored:0,skipped:0}; });
 await runAccountCycle();
 expect(vi.mocked(syncInbox).mock.calls.map(c=>c[0].id)).toEqual([f.owner.id,f.member.id]);
 expect(runGhostDetection).toHaveBeenCalledTimes(2);
});
it('isolates failures without printing token-bearing errors',async()=>{
 vi.mocked(syncInbox).mockRejectedValueOnce(new Error('secret-token-and-email'));
 await runAccountCycle(); expect(syncInbox).toHaveBeenCalledTimes(2); expect(runGhostDetection).toHaveBeenCalledTimes(2);
 expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-token-and-email');
});
it('rechecks access before each account begins and after awaited sync',async()=>{
 vi.mocked(syncInbox).mockImplementation(async account=>{ if(account.id===f.owner.id) revokeAccount(f.member.id); return {stored:0,skipped:0}; });
 await runAccountCycle();
 expect(syncInbox).toHaveBeenCalledTimes(1);
 expect(runGhostDetection).toHaveBeenCalledTimes(1);
});
it('coalesces overlapping cycles rather than processing accounts twice',async()=>{
 let finish!:()=>void; const gate=new Promise<void>(r=>{finish=r;});
 vi.mocked(syncInbox).mockImplementation(async()=>{await gate; return {stored:0,skipped:0};});
 const first=runAccountCycle(), second=runAccountCycle();
 expect(first).toBe(second); finish(); await Promise.all([first,second]);
 expect(syncInbox).toHaveBeenCalledTimes(2);
});
