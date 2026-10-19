import { afterEach, beforeEach, expect, it } from "vitest";
import { createAccountFixture } from "./helpers/accounts";
import { getRegistry, revokeAccount, approveEmail } from "@/lib/accounts";
import { createSession, lookupSession, revokeSession } from "@/lib/sessions";
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); }); afterEach(() => f.cleanup());
it("uses unpredictable opaque tokens, only stores hashes and expires after thirty days", () => {
  const time = Date.now(), token = createSession(f.owner, time);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(createSession(f.owner, time)).not.toBe(token);
  expect(JSON.stringify(getRegistry().prepare("SELECT * FROM sessions").all())).not.toContain(token);
  expect(lookupSession(token, time)).toEqual(f.owner);
  expect(lookupSession(token, time + 30 * 86400000 + 1)).toBeNull();
  expect(lookupSession("123.legacy-signed-cookie")).toBeNull();
  expect(lookupSession(undefined)).toBeNull();
});
it("logout and revocation invalidate sessions, even after reapproval", () => {
  const a = createSession(f.member), b = createSession(f.member);
  revokeSession(a); expect(lookupSession(a)).toBeNull();
  revokeAccount(f.member.id); expect(lookupSession(b)).toBeNull();
  approveEmail(f.member.email); expect(lookupSession(b)).toBeNull();
  expect(lookupSession(createSession(f.member))).toEqual(f.member);
});
