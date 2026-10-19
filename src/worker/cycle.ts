import { getActiveAccount, listActiveAccounts } from "../lib/accounts";
import { syncInbox } from "../lib/email/sync";
import { runGhostDetection } from "../lib/ghost";
import { getKv } from "../lib/settings";

async function cycle(): Promise<void> {
  for (const candidate of listActiveAccounts()) {
    const account = getActiveAccount(candidate.id);
    if (!account) continue;
    try {
      if (getKv(account, "gmailError")) console.log(`[worker] account ${account.id} sync paused: reconnect Gmail`);
      else {
        const { stored, skipped } = await syncInbox(account);
        console.log(`[worker] account ${account.id} sync: stored ${stored}, skipped ${skipped}`);
      }
    } catch { console.error(`[worker] account ${account.id} sync failed`); }
    if (!getActiveAccount(account.id)) continue;
    try {
      const { flagged, ghosted } = runGhostDetection(account);
      console.log(`[worker] account ${account.id} ghost: flagged ${flagged}, ghosted ${ghosted}`);
    } catch { console.error(`[worker] account ${account.id} ghost detection failed`); }
  }
}
let running: Promise<void> | null = null;
export function runAccountCycle(): Promise<void> {
  return running ??= cycle().finally(() => { running = null; });
}
