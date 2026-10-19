import { afterEach, beforeEach } from "vitest";
import { resetAccounts } from "@/lib/accounts";
import { resetDb } from "@/lib/db";
beforeEach(() => {
  resetDb(); resetAccounts();
  process.env.DB_PATH = ":memory:";
  process.env.OWNER_GOOGLE_EMAIL = "owner@example.com";
});
afterEach(() => { resetDb(); resetAccounts(); });
