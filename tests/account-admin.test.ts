import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { listAccounts, getActiveAccount, claimGoogleAccount } from '@/lib/accounts';
import { createSession, lookupSession } from '@/lib/sessions';
import { approveAccountAction, revokeAccountAction } from '@/app/app/settings/account-actions';
vi.mock('@/lib/auth',()=>({requireSession:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { requireSession } from '@/lib/auth';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(()=>{ f=createAccountFixture(); vi.mocked(requireSession).mockResolvedValue(f.owner); });
afterEach(()=>f.cleanup());
it('lets owner approve normalized emails once and rejects invalid input',async()=>{
 expect(await approveAccountAction(' NewUser@Gmail.com ')).toEqual({ok:true});
 expect(await approveAccountAction('newuser@gmail.com')).toEqual({ok:true});
 expect(listAccounts().filter(a=>a.email==='newuser@gmail.com')).toHaveLength(1);
 expect((await approveAccountAction('not an email')).ok).toBe(false);
});
it('rejects member direct invocations and owner self-revocation',async()=>{
 vi.mocked(requireSession).mockResolvedValue(f.member);
 expect((await approveAccountAction('intruder@gmail.com')).ok).toBe(false);
 expect((await revokeAccountAction(f.owner.id)).ok).toBe(false);
 expect(listAccounts()).toHaveLength(2);
 vi.mocked(requireSession).mockResolvedValue(f.owner);
 expect((await revokeAccountAction(f.owner.id)).ok).toBe(false);
 expect(getActiveAccount(f.owner.id)).not.toBeNull();
});
it('revokes existing sessions and restores the account without restoring old sessions',async()=>{
 const token=createSession(f.member);
 expect(await revokeAccountAction(f.member.id)).toEqual({ok:true});
 expect(lookupSession(token)).toBeNull();
 expect(await approveAccountAction(f.member.email)).toEqual({ok:true});
 expect(claimGoogleAccount({email:f.member.email,sub:'member-sub',emailVerified:true})).toEqual(f.member);
 expect(lookupSession(token)).toBeNull();
});
