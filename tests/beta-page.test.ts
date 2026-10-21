import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ account:null as null | {id:number;email:string;role:'member'}, token:undefined as string|undefined }));
vi.mock('next/headers', () => ({cookies:async () => ({get:()=>state.token ? {value:state.token}:undefined})}));
vi.mock('@/lib/sessions', () => ({SESSION_COOKIE:'jt_session',lookupSession:vi.fn(()=>state.account)}));
import BetaPage from '@/app/beta/page';
import { lookupSession } from '@/lib/sessions';
afterEach(()=>{vi.unstubAllEnvs();state.account=null;state.token=undefined;});
const render = async (error?:string) => renderToStaticMarkup(await BetaPage({searchParams:Promise.resolve({error}),params:Promise.resolve({})}));
it('offers Google registration with separate Gmail consent and feedback', async ()=>{
  vi.stubEnv('OPEN_BETA_ENABLED','true');
  const html = await render();
  expect(html).toContain('Continue with Google');
  expect(html).toContain('Connecting Gmail is optional');
  expect(html).toContain('mailto:hello@naspadstudio.id');
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');
});
it('checks the session rather than trusting a cookie',async()=>{
  vi.stubEnv('OPEN_BETA_ENABLED','true');state.token='forged';
  expect(await render()).toContain('Continue with Google');
  expect(lookupSession).toHaveBeenCalledWith('forged');
});
it('offers authenticated users their tracker even when registration is paused',async()=>{
  vi.stubEnv('OPEN_BETA_ENABLED','false');state.account={id:2,email:'member@gmail.com',role:'member'};
  const html=await render();expect(html).toContain('Open your tracker');expect(html).toContain('href="/app"');
  expect(html).not.toContain('Continue with Google');
});
it('explains paused registration and keeps existing-user login available',async()=>{
  vi.stubEnv('OPEN_BETA_ENABLED','false');const html=await render();
  expect(html).toContain('The beta is invite-only');
  expect(html).toContain('approved Google account');expect(html).toContain('href="/login"');
  expect(html).not.toContain('Continue with Google');
});
it.each([['cancelled','Sign-in wasn’t completed'],['google','We couldn’t sign you in']])('announces %s errors',async(error,message)=>{
  vi.stubEnv('OPEN_BETA_ENABLED','true');const html=await render(error);
  expect(html).toContain('role="alert"');expect(html).toContain(message);
});
