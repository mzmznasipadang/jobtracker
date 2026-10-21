import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createAccountFixture } from './helpers/accounts';
import { revokeAccount } from '@/lib/accounts';
import { createMobileHandoff, exchangeMobileHandoff, requireMobileAccount } from '@/lib/mobile-auth';
let f: ReturnType<typeof createAccountFixture>;
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
beforeEach(() => { f = createAccountFixture(); });
afterEach(() => { vi.useRealTimers(); f.cleanup(); });
it('issues an account session only after correct PKCE, once', () => {
    const code = createMobileHandoff(f.member, challenge);
    expect(() => exchangeMobileHandoff(code, 'b'.repeat(43))).toThrow();
    const result = exchangeMobileHandoff(code, verifier);
    expect(requireMobileAccount(new Request('https://test', { headers: { Authorization: `Bearer ${result.token}` } }))).toEqual(f.member);
    expect(() => exchangeMobileHandoff(code, verifier)).toThrow();
});
it('expires exactly at the deadline and rejects revoked accounts', () => {
    const code = createMobileHandoff(f.member, challenge);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60000);
    expect(() => exchangeMobileHandoff(code, verifier)).toThrow();
    vi.useRealTimers();
    const other = createMobileHandoff(f.member, challenge);
    revokeAccount(f.member.id);
    expect(() => exchangeMobileHandoff(other, verifier)).toThrow();
});
it('rejects missing/malformed tokens and revokes active sessions immediately', () => {
    for (const value of ['', 'Bearer bad', 'Basic abc'])
        expect(() => requireMobileAccount(new Request('https://test', { headers: { Authorization: value } }))).toThrow();
    const { token } = exchangeMobileHandoff(createMobileHandoff(f.member, challenge), verifier);
    revokeAccount(f.member.id);
    expect(() => requireMobileAccount(new Request('https://test', { headers: { Authorization: `Bearer ${token}` } }))).toThrow();
});
it('rejects invalid challenges and isolates simultaneous exchanges', () => {
    expect(() => createMobileHandoff(f.owner, 'bad')).toThrow();
    const v2 = 'z'.repeat(43), c2 = createHash('sha256').update(v2).digest('base64url');
    const first = createMobileHandoff(f.owner, challenge), second = createMobileHandoff(f.member, c2);
    expect(() => exchangeMobileHandoff(first, v2)).toThrow();
    expect(exchangeMobileHandoff(second, v2).account.id).toBe(f.member.id);
    expect(exchangeMobileHandoff(first, verifier).account.id).toBe(f.owner.id);
});
