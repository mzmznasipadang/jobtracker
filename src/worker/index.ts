import { getOwnerAccount } from "../lib/accounts";
import { syncInbox } from "../lib/email/sync";
import { runGhostDetection } from "../lib/ghost";
import { getKv } from "../lib/settings";

const INTERVAL_MS = 10 * 60_000;
const SHUTDOWN_GRACE_MS = 10_000;

// Never log the error object itself: SDK/Google errors can carry request headers and tokens.
const fail = (step: string, e: unknown) => console.error(`[worker] ${step} failed: ${e instanceof Error ? e.message : String(e)}`);

async function cycle(): Promise<void> {
  const account = getOwnerAccount();
  try {
    if (getKv(account, "gmailError")) console.log("[worker] sync paused: Gmail needs reconnecting");
    else {
      const { stored, skipped } = await syncInbox(account);
      console.log(`[worker] sync: stored ${stored}, skipped ${skipped}`);
    }
  } catch (e) {
    fail("sync", e);
  }
  try {
    const { flagged, ghosted } = runGhostDetection(account);
    console.log(`[worker] ghost: flagged ${flagged}, ghosted ${ghosted}`);
  } catch (e) {
    fail("ghost detection", e);
  }
}

async function main(): Promise<void> {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  // setTimeout chained after each cycle, so a slow run can never overlap the next.
  const loop = () => {
    running = cycle().then(() => {
      if (!stopping) timer = setTimeout(loop, INTERVAL_MS);
    });
  };

  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    void running.then(() => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  loop();
}

main().catch((e) => {
  fail("startup", e);
  process.exit(1);
});
