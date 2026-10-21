import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAccountFixture } from "./helpers/accounts";
import { createOAuthState } from "@/lib/oauth-state";
import { getKv } from "@/lib/settings";
const mocks = vi.hoisted(() => ({ jar: {get:vi.fn(), delete:vi.fn()}, auth:vi.fn(), exchange:vi.fn() }));
vi.mock('next/headers',()=>({cookies:async()=>mocks.jar}));
vi.mock('@/lib/auth',async orig=>({...await orig<typeof import('@/lib/auth')>(), requireSession:mocks.auth}));
vi.mock('@/lib/email/gmail',()=>({STATE_COOKIE:'gmail_oauth_state',appUrl:()=> 'https://tracking.example.id',exchangeCode:mocks.exchange}));
import { GET } from '@/app/api/gmail/callback/route';
let f: ReturnType<typeof createAccountFixture>, flow: ReturnType<typeof createOAuthState>, session:string;
beforeEach(()=>{
 f=createAccountFixture(); vi.clearAllMocks(); session='session-a'; mocks.auth.mockResolvedValue(f.member);
 flow=createOAuthState({purpose:'gmail',accountId:f.member.id,sessionToken:session});
 mocks.jar.get.mockImplementation((name:string)=>(name==='jt_session'?{value:session}:name==='gmail_oauth_state'?{value:flow.cookie}:undefined));
 mocks.exchange.mockResolvedValue(undefined);
});
afterEach(()=>f.cleanup());
const req=()=>new NextRequest(`https://tracking.example.id/api/gmail/callback?code=code&state=${flow.state}`);
it('binds a Gmail callback to the initiating account and session before exchanging',async()=>{
 mocks.auth.mockResolvedValue(f.owner);
 expect((await GET(req())).status).toBe(400); expect(mocks.exchange).not.toHaveBeenCalled();
 mocks.auth.mockResolvedValue(f.member); session='other-session';
 expect((await GET(req())).status).toBe(400); expect(mocks.exchange).not.toHaveBeenCalled();
 session='session-a'; expect((await GET(req())).status).toBe(307);
 expect(mocks.exchange).toHaveBeenCalledWith(f.member,'code',expect.any(String));
 expect((await GET(req())).status).toBe(400); expect(mocks.exchange).toHaveBeenCalledTimes(1);
 expect(getKv(f.owner,'gmailToken')).toBeNull();
});
