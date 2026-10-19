import { runAccountCycle } from "./cycle";

const INTERVAL_MS = 10 * 60_000;
const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  // setTimeout chained after each cycle, so a slow run can never overlap the next.
  const loop = () => {
    running = runAccountCycle().then(() => {
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

main().catch(() => {
  console.error("[worker] startup failed");
  process.exit(1);
});
