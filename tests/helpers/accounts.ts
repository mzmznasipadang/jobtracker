import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveEmail, claimGoogleAccount, getOwnerAccount, resetAccounts } from "@/lib/accounts";
import { resetDb } from "@/lib/db";

export function createAccountFixture() {
  resetDb(); resetAccounts();
  const dir = mkdtempSync(join(tmpdir(), "jt-test-"));
  process.env.DB_PATH = join(dir, "jobtracker.db");
  process.env.OWNER_GOOGLE_EMAIL = "owner@example.com";
  const owner = getOwnerAccount();
  approveEmail("member@gmail.com");
  const member = claimGoogleAccount({ email: "member@gmail.com", sub: "member-sub", emailVerified: true });
  return { owner, member, cleanup() { resetDb(); resetAccounts(); rmSync(dir, { recursive: true, force: true }); } };
}
