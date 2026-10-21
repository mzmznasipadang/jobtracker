import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { claimGoogleAccount, listAccounts, revokeAccount, accountDbPath } from '@/lib/accounts';
import { getAccountDb } from '@/lib/db';
let f: ReturnType<typeof createAccountFixture>;
const claim = (email = 'new@gmail.com', sub = 'new-sub') => claimGoogleAccount({ email, sub, emailVerified: true });
beforeEach(() => { vi.stubEnv('OPEN_BETA_ENABLED', 'false'); f = createAccountFixture(); });
afterEach(() => { f.cleanup(); vi.unstubAllEnvs(); });
it.each([undefined, 'false', 'TRUE', '1'])('keeps registration closed for %s', value => {
  vi.stubEnv('OPEN_BETA_ENABLED', value);
  expect(() => claim()).toThrow();
  expect(listAccounts()).toHaveLength(2);
  expect(claimGoogleAccount({email:f.member.email, sub:'member-sub', emailVerified:true})).toEqual(f.member);
});
it('registers a verified member once, normalizes email, and isolates data', () => {
  vi.stubEnv('OPEN_BETA_ENABLED', 'true');
  getAccountDb(f.owner).prepare("INSERT INTO kv VALUES ('private','1')").run();
  const member = claim();
  expect(member.role).toBe('member');
  expect(claim('NEW@gmail.com')).toEqual(member);
  expect(listAccounts()).toHaveLength(3);
  expect(accountDbPath(member)).not.toBe(accountDbPath(f.owner));
  expect(getAccountDb(member).prepare('SELECT * FROM kv').all()).toEqual([]);
});
it('does not reactivate revoked accounts or rebind existing subjects', () => {
  vi.stubEnv('OPEN_BETA_ENABLED', 'true');
  claim(f.owner.email, 'owner-sub');
  revokeAccount(f.member.id);
  expect(() => claim(f.member.email, 'member-sub')).toThrow();
  expect(() => claim('other@gmail.com', 'member-sub')).toThrow();
  expect(() => claim(f.owner.email, 'imposter')).toThrow();
  expect(listAccounts()).toHaveLength(2);
});
it('rejects invalid verified identities without creating an account', () => {
  vi.stubEnv('OPEN_BETA_ENABLED', 'true');
  expect(() => claimGoogleAccount({ email:'new@gmail.com', sub:'new', emailVerified:false })).toThrow();
  expect(() => claim('new@gmail.com', '')).toThrow();
  expect(listAccounts()).toHaveLength(2);
});
it('serializes simultaneous first claims from separate database connections', async () => {
  vi.stubEnv('OPEN_BETA_ENABLED', 'true');
  const { spawn } = await import('node:child_process');
  const source = `import { claimGoogleAccount } from './src/lib/accounts.ts'; console.log(JSON.stringify(claimGoogleAccount({email:'race@gmail.com',sub:'race-sub',emailVerified:true})));`;
  const run = () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: process.env });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  });
  const results = await Promise.all([run(), run()]);
  expect(JSON.parse(results[0])).toEqual(JSON.parse(results[1]));
  expect(listAccounts().filter(account => account.email === 'race@gmail.com')).toHaveLength(1);
});
it('applies global AI limits and owner restrictions to a new public member', async () => {
  vi.stubEnv('OPEN_BETA_ENABLED', 'true');
  const { saveUsagePolicy, reserveAiRequest, getUsageSummary } = await import('@/lib/ai-usage');
  const { requireOwner } = await import('@/lib/ai-settings');
  saveUsagePolicy(f.owner, {scope:'global',limit:0,paused:false,inherit:false,revision:0});
  const member = claim();
  expect(getUsageSummary(member).limit).toBe(0);
  expect(() => reserveAiRequest(member, {provider:'openai',model:'test'}, 'extract')).toThrow();
  expect(() => requireOwner(member)).toThrow();
  expect(() => saveUsagePolicy(member, {scope:'global',limit:null,paused:false,inherit:false,revision:1})).toThrow();
});
