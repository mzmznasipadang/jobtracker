import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAccountFixture } from './helpers/accounts';
import { createOAuthState, readSignInReturnTo, OAUTH_MAX_AGE } from '@/lib/oauth-state';
import { encrypt, decrypt } from '@/lib/crypto';
const mocks = vi.hoisted(() => ({ jar: new Map<string,string>(), set: vi.fn() }));
vi.mock('next/headers', () => ({cookies: async () => ({get:(name:string) => mocks.jar.has(name) ? {value:mocks.jar.get(name)} : undefined, delete:({name}:{name:string}) => mocks.jar.delete(name), set:mocks.set})}));
import { GET } from '@/app/api/auth/google/callback/route';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); mocks.jar.clear(); mocks.set.mockClear(); });
afterEach(() => { f.cleanup(); vi.useRealTimers(); });
it('reads only intact, matching, unexpired signin return context', () => {
  const flow = createOAuthState({purpose:'signin', returnTo:'/beta'});
  expect(readSignInReturnTo(flow.cookie, flow.state)).toBe('/beta');
  expect(readSignInReturnTo(flow.cookie, 'wrong')).toBeUndefined();
  expect(readSignInReturnTo('corrupt', flow.state)).toBeUndefined();
  const tampered = encrypt(JSON.stringify({...JSON.parse(decrypt(flow.cookie)), returnTo:'https://evil.test'}));
  expect(readSignInReturnTo(tampered, flow.state)).toBeUndefined();
  const gmail = encrypt(JSON.stringify({...JSON.parse(decrypt(flow.cookie)), purpose:'gmail'}));
  expect(readSignInReturnTo(gmail, flow.state)).toBeUndefined();
  vi.useFakeTimers(); vi.setSystemTime(Date.now()+(OAUTH_MAX_AGE+1)*1000);
  expect(readSignInReturnTo(flow.cookie, flow.state)).toBeUndefined();
});
it.each([['error=access_denied', 'cancelled'], ['', 'google']])('returns beta failure %s to %s', async (query, error) => {
  const flow = createOAuthState({purpose:'signin', returnTo:'/beta'});
  mocks.jar.set('google_signin_state', flow.cookie);
  const result = await GET(new NextRequest(`https://test/api/auth/google/callback?state=${flow.state}&${query}`));
  const destination = new URL(result.headers.get('location')!);
  expect(destination.pathname).toBe('/beta');
  expect(destination.searchParams.get('error')).toBe(error);
  expect(mocks.set).not.toHaveBeenCalled();
});
it('does not accept a return target from the callback query or corrupt cookie', async () => {
  mocks.jar.set('google_signin_state', 'corrupt');
  const result = await GET(new NextRequest('https://test/api/auth/google/callback?returnTo=/beta&state=wrong'));
  expect(new URL(result.headers.get('location')!).pathname).toBe('/login');
});
