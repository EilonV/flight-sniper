import cron from "node-cron";
import { config } from "../src/lib/config";
import { runFullScan, runDeepScan } from "./scan";

let running = false;

async function guarded(fn: () => Promise<void>, label: string) {
  if (running) {
    console.log(`[worker] skipping ${label} — a scan is already running`);
    return;
  }
  running = true;
  try {
    await fn();
  } catch (e) {
    console.error(`[worker] ${label} failed:`, (e as Error).message);
  } finally {
    running = false;
  }
}

console.log(
  `[worker] starting. full="${config.fullScanCron}" deep="${config.deepScanCron}" — running an initial full scan now.`,
);

// Kick off one full scan immediately so there's data right away.
guarded(runFullScan, "initial full scan");

cron.schedule(config.fullScanCron, () => guarded(runFullScan, "full scan"));
cron.schedule(config.deepScanCron, () => guarded(runDeepScan, "deep scan"));

// Keep the process alive.
process.stdin.resume();
