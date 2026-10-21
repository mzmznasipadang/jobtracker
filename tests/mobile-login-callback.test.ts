import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAccountFixture } from './helpers/accounts';
import { createOAuthState } from '@/lib/oauth-state';
const mocks = vi.hoisted(() => ({ jar: new Map<string, string>(), set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined, delete: ({ name }: {
            name: string;
        }) => mocks.jar.delete(name), set: mocks.set }) }));
import { GET } from '@/app/api/auth/google/callback/route';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); mocks.jar.clear(); mocks.set.mockReset(); });
afterEach(() => f.cleanup());
it('returns Google denial to the initiating native app without issuing a session', async () => {
    const flow = createOAuthState({ purpose: 'signin', mobile: { challenge: 'c'.repeat(43), clientState: 's'.repeat(43) } });
    mocks.jar.set('google_signin_state_' + flow.state, flow.cookie);
    const response = await GET(new NextRequest('https://test/api/auth/google/callback?error=access_denied&state=' + flow.state));
    const location = new URL(response.headers.get('location')!);
    expect(location.protocol).toBe('jobtracker:');
    expect(location.searchParams.get('state')).toBe('s'.repeat(43));
    expect(location.searchParams.has('error')).toBe(true);
    expect(location.searchParams.has('code')).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
});
