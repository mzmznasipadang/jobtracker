import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccountFixture } from "./helpers/accounts";
import { createOAuthState, consumeOAuthState } from "@/lib/oauth-state";
import { beginGoogleLogin, completeGoogleLogin } from "@/lib/google-login";
const google = vi.hoisted(() => ({ getToken: vi.fn(), verifyIdToken: vi.fn() }));
vi.mock("google-auth-library", () => ({ OAuth2Client: class {
  getToken = google.getToken; verifyIdToken = google.verifyIdToken;
  generateAuthUrl(o: Record<string, string>) { return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({...o, scope: Array.isArray(o.scope) ? o.scope.join(' ') : o.scope}).toString(); }
} }));
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); process.env.GOOGLE_CLIENT_ID = "test-client"; process.env.GOOGLE_CLIENT_SECRET = "test-secret"; vi.clearAllMocks(); });
afterEach(() => f.cleanup());
const payload = (nonce: string) => ({ sub: "google-owner", email: "owner@example.com", email_verified: true, aud: "test-client", iss: "https://accounts.google.com", exp: Math.floor(Date.now()/1000)+3600, nonce });
const mockReply = (p: Record<string, unknown>) => { google.getToken.mockResolvedValue({tokens:{id_token:"id-token"}}); google.verifyIdToken.mockResolvedValue({getPayload:()=>p}); };
it("requests only basic identity with nonce and S256 PKCE and signs approved owner in", async () => {
  const a = await beginGoogleLogin("/app/new?via=bm");
  const url = new URL(a.url), state = url.searchParams.get('state')!;
  expect(url.searchParams.get('scope')).toBe('openid email profile');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  mockReply(payload(url.searchParams.get('nonce')!));
  expect(await completeGoogleLogin('code', state, a.cookie)).toEqual({ account:f.owner, next:'/app/new?via=bm' });
  expect(google.getToken.mock.calls[0][0].codeVerifier).toHaveLength(43);
  await expect(completeGoogleLogin('code',state,a.cookie)).rejects.toThrow();
  expect(google.getToken).toHaveBeenCalledTimes(1);
});
it.each([
  {email:'stranger@gmail.com'}, {email_verified:false}, {sub:''}, {email:''},
  {aud:'other-client'}, {iss:'https://evil.example'}, {exp:1}, {nonce:'wrong'},
])("rejects invalid/unapproved ID claims %j", async over => {
  const s = createOAuthState({purpose:'signin'}); mockReply({...payload(s.nonce),...over});
  await expect(completeGoogleLogin('code',s.state,s.cookie)).rejects.toThrow();
});
it("rejects wrong/corrupt state before exchanging a code", async () => {
  const s = createOAuthState({purpose:'signin'});
  await expect(completeGoogleLogin('code','wrong',s.cookie)).rejects.toThrow();
  await expect(completeGoogleLogin('code',s.state,'corrupt')).rejects.toThrow();
  expect(google.getToken).not.toHaveBeenCalled();
});
it("binds Gmail state to purpose/account/session and rejects expired/replayed callbacks", () => {
  const s = createOAuthState({purpose:'gmail',accountId:f.member.id,sessionToken:'one-session'});
  expect(()=>consumeOAuthState(s.state,s.cookie,{purpose:'signin'})).toThrow();
  expect(()=>consumeOAuthState(s.state,s.cookie,{purpose:'gmail',accountId:f.owner.id,sessionToken:'one-session'})).toThrow();
  expect(()=>consumeOAuthState(s.state,s.cookie,{purpose:'gmail',accountId:f.member.id,sessionToken:'other-session'})).toThrow();
  const data = consumeOAuthState(s.state,s.cookie,{purpose:'gmail',accountId:f.member.id,sessionToken:'one-session'});
  expect(data.verifier).toHaveLength(43);
  expect(()=>consumeOAuthState(s.state,s.cookie,{purpose:'gmail',accountId:f.member.id,sessionToken:'one-session'})).toThrow();
  const old = createOAuthState({purpose:'signin'});
  vi.useFakeTimers(); vi.setSystemTime(Date.now()+11*60000);
  try { expect(()=>consumeOAuthState(old.state,old.cookie,{purpose:'signin'})).toThrow(); } finally { vi.useRealTimers(); }
});
