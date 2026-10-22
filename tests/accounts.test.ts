import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOwnerAccount, approveEmail, claimGoogleAccount, listAccounts, getActiveAccount, revokeAccount, accountDbPath, resetAccounts } from "@/lib/accounts";
import { getAccountDb, openDb, resetDb } from "@/lib/db";

let dir: string;
beforeEach(() => {
  resetDb(); resetAccounts();
  dir = mkdtempSync(join(tmpdir(), "jt-accounts-"));
  process.env.DB_PATH = join(dir, "jobtracker.db");
  process.env.OWNER_GOOGLE_EMAIL = "owner@example.com";
});
afterEach(() => { resetDb(); resetAccounts(); rmSync(dir, { recursive: true, force: true }); });
const claim = (email: string, sub = email) => claimGoogleAccount({ email, sub, emailVerified: true });

it("bootstraps the explicit owner idempotently and preserves legacy data", () => {
  const db = openDb(process.env.DB_PATH!);
  db.prepare("INSERT INTO kv VALUES ('legacy', '\"kept\"')").run(); db.close();
  const owner = getOwnerAccount();
  expect(getOwnerAccount()).toEqual(owner);
  expect(owner.email).toBe("owner@example.com");
  expect(listAccounts()).toHaveLength(1);
  expect(getAccountDb(owner).prepare("SELECT value_json FROM kv WHERE key='legacy'").get()).toEqual({ value_json: '"kept"' });
});
it("never grants the first visitor the owner's data and rejects unverified identities", () => {
  expect(() => claim("stranger@gmail.com")).toThrow();
  expect(() => claimGoogleAccount({ email: "owner@example.com", sub: "x", emailVerified: false })).toThrow();
  expect(listAccounts()[0].claimed).toBe(false);
});
it("binds subject once and rejects changed/recycled identity claims", () => {
  claim("owner@example.com", "owner-sub");
  expect(() => claim("owner@example.com", "other-sub")).toThrow();
  approveEmail("new@gmail.com");
  expect(() => claim("new@gmail.com", "owner-sub")).toThrow();
  expect(claim("OWNER@example.com", "owner-sub").role).toBe("owner");
});
it("uses distinct server-controlled paths and rejects forged/absent accounts", () => {
  const owner = getOwnerAccount();
  approveEmail(" Member@gmail.com ");
  expect(existsSync(join(dir, "users"))).toBe(false);
  const member = claim("member@gmail.com");
  expect(accountDbPath({ ...member, role: "owner" })).toBe(join(dir, "users", `${member.id}.db`));
  expect(accountDbPath(owner)).toBe(process.env.DB_PATH);
  getAccountDb(member).prepare("INSERT INTO kv VALUES ('member','1')").run();
  expect(getAccountDb(owner).prepare("SELECT * FROM kv").all()).toEqual([]);
  expect(() => getAccountDb(undefined as never)).toThrow();
  expect(() => accountDbPath({ ...member, id: -1 })).toThrow();
});
it("revokes members immediately, preserves binding on reapproval and protects owner", () => {
  approveEmail("member@gmail.com"); const member = claim("member@gmail.com", "stable-sub");
  revokeAccount(member.id);
  expect(getActiveAccount(member.id)).toBeNull();
  expect(() => getAccountDb(member)).toThrow();
  approveEmail(member.email);
  expect(claim(member.email, "stable-sub").id).toBe(member.id);
  expect(() => claim(member.email, "recycled-sub")).toThrow();
  expect(() => revokeAccount(getOwnerAccount().id)).toThrow();
  expect(listAccounts()[1]).not.toHaveProperty("sub");
});
