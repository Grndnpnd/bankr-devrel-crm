/**
 * Standalone cron tick — run by Railway's native cron on a heartbeat (e.g. every
 * 5 minutes). Calls the scheduler directly (no HTTP, no secret needed; this is
 * our own process). Self-contained: no external pinger.
 *
 * Run: tsx scripts/cronTick.ts   (wired as `npm run cron:tick`)
 */
import { runDueJobs } from "../src/lib/scheduler";
import { prisma } from "../src/lib/prisma";

async function main() {
  const started = Date.now();
  try {
    const summary = await runDueJobs();
    const ran = summary.ran.length;
    console.log(`[cron] tick ok — checked ${summary.checked}, ran ${ran} (${Date.now() - started}ms)`);
    if (ran) console.log(`[cron] ${JSON.stringify(summary.ran)}`);
  } catch (e: any) {
    console.error(`[cron] tick failed: ${e?.message ?? e}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
