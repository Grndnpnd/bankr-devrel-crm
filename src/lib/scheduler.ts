import { prisma } from '@/lib/prisma';
import { enrichAndBackfillAll } from '@/lib/enrich';
import { runImport } from '@/lib/adapters';
import { GoogleSheetsAdapter } from '@/lib/adapters/googleSheets';
import { CronExpressionParser } from 'cron-parser';

/**
 * Scheduler core. An external pinger hits /api/cron/tick on a fixed heartbeat;
 * on each tick we find jobs whose nextRunAt is due, run them, and reschedule.
 * The pinger is a dumb clock — all scheduling logic lives here.
 */

// Interval presets (friendly UI) → milliseconds. Anything not a preset is treated
// as a standard cron expression.
export const SCHEDULE_PRESETS: Record<string, { label: string; ms: number }> = {
  '15m': { label: 'Every 15 minutes', ms: 15 * 60_000 },
  '30m': { label: 'Every 30 minutes', ms: 30 * 60_000 },
  'hourly': { label: 'Hourly', ms: 60 * 60_000 },
  '6h': { label: 'Every 6 hours', ms: 6 * 60 * 60_000 },
  '12h': { label: 'Every 12 hours', ms: 12 * 60 * 60_000 },
  'daily': { label: 'Daily', ms: 24 * 60 * 60_000 },
};

export function isPreset(schedule: string): boolean {
  return schedule in SCHEDULE_PRESETS;
}

/** Validate a schedule string (preset token or cron expression). */
export function validateSchedule(schedule: string): { ok: boolean; error?: string } {
  if (isPreset(schedule)) return { ok: true };
  try {
    CronExpressionParser.parse(schedule);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Not a valid preset or cron expression' };
  }
}

/** Compute the next run time after `from` for a given schedule. */
export function nextRunFrom(schedule: string, from: Date = new Date()): Date {
  if (isPreset(schedule)) {
    return new Date(from.getTime() + SCHEDULE_PRESETS[schedule].ms);
  }
  try {
    const it = CronExpressionParser.parse(schedule, { currentDate: from });
    return it.next().toDate();
  } catch {
    // Unparseable → default to hourly so a bad expression can't wedge the job.
    return new Date(from.getTime() + 60 * 60_000);
  }
}

// ── Job-type handlers ───────────────────────────────────────────
// Each handler does the work and returns a JSON-serializable result summary.
// Adding a new scheduled capability = one entry here.

export interface JobHandler {
  type: string;
  label: string;
  description: string;
  run: () => Promise<any>;
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  refresh_onchain: {
    type: 'refresh_onchain',
    label: 'Refresh onchain data',
    description: 'Re-fetch volume / market cap for tracked tokens and backfill matches. Saved panels reflect the fresh data automatically.',
    run: async () => {
      const r = await enrichAndBackfillAll();
      return r;
    },
  },
  refresh_sheet: {
    type: 'refresh_sheet',
    label: 'Import from Google Sheet',
    description: 'Pull new/updated form submissions from the connected Google Sheet into the CRM. New projects appear automatically; recorded in the Import Log.',
    run: async () => {
      try {
        const result = await runImport(new GoogleSheetsAdapter());
        await prisma.importLog.create({
          data: { source: 'google', pulled: result.pulled, created: result.created, updated: result.updated, ok: true, by: 'cron' },
        }).catch(() => {});
        return result;
      } catch (e: any) {
        const message = e?.message ?? 'sheet import failed';
        await prisma.importLog.create({ data: { source: 'google', ok: false, message, by: 'cron' } }).catch(() => {});
        throw e; // re-throw so the job also records the error in its own status
      }
    },
  },
};

export const jobTypeList = () =>
  Object.values(JOB_HANDLERS).map((h) => ({ type: h.type, label: h.label, description: h.description }));

/**
 * Core infrastructure refreshes. These are HARD-CODED, not CronJob table rows —
 * they can't be deleted or disabled, they just always run. Intervals are fixed
 * in code (the safe place for load-bearing infra timing). Run state is tracked
 * in CoreJobState purely for display + due-checking. The custom cron harness
 * (CronJob table) remains for ad-hoc admin jobs.
 */
export const CORE_TYPES = ['refresh_onchain', 'refresh_sheet'];

export const CORE_JOBS: { type: string; name: string; intervalMs: number }[] = [
  { type: 'refresh_onchain', name: 'Refresh all data', intervalMs: 15 * 60_000 },
  { type: 'refresh_sheet', name: 'Refresh sheet submissions', intervalMs: 30 * 60_000 },
];

/** Run the hard-coded core jobs whose interval has elapsed. */
async function runDueCoreJobs(now: Date): Promise<any[]> {
  const ran: any[] = [];
  for (const core of CORE_JOBS) {
    const handler = JOB_HANDLERS[core.type];
    if (!handler) continue;
    const state = await prisma.coreJobState.findUnique({ where: { type: core.type } });
    const due = !state?.lastRunAt || (now.getTime() - new Date(state.lastRunAt).getTime()) >= core.intervalMs;
    if (!due) continue;
    // Reserve: stamp lastRunAt now so an overlapping tick won't double-fire.
    await prisma.coreJobState.upsert({
      where: { type: core.type },
      update: { lastStatus: 'running', lastRunAt: now },
      create: { type: core.type, lastStatus: 'running', lastRunAt: now },
    });
    try {
      const result = await handler.run();
      await prisma.coreJobState.update({ where: { type: core.type }, data: { lastStatus: 'ok', lastResult: result ?? {}, lastError: null, lastRunAt: new Date() } });
      ran.push({ type: core.type, status: 'ok', result });
    } catch (e: any) {
      await prisma.coreJobState.update({ where: { type: core.type }, data: { lastStatus: 'error', lastError: e?.message ?? 'failed', lastRunAt: new Date() } });
      ran.push({ type: core.type, status: 'error', error: e?.message });
    }
  }
  return ran;
}

/** Force-run a single core job now (manual "Run now" from the admin UI). */
export async function runCoreJobNow(type: string): Promise<{ ok: boolean; result?: any; error?: string }> {
  const handler = JOB_HANDLERS[type];
  if (!handler || !CORE_JOBS.some((c) => c.type === type)) return { ok: false, error: 'unknown core job' };
  await prisma.coreJobState.upsert({
    where: { type }, update: { lastStatus: 'running' }, create: { type, lastStatus: 'running' },
  });
  try {
    const result = await handler.run();
    await prisma.coreJobState.update({ where: { type }, data: { lastStatus: 'ok', lastResult: result ?? {}, lastError: null, lastRunAt: new Date() } });
    return { ok: true, result };
  } catch (e: any) {
    await prisma.coreJobState.update({ where: { type }, data: { lastStatus: 'error', lastError: e?.message ?? 'failed', lastRunAt: new Date() } });
    return { ok: false, error: e?.message };
  }
}

/**
 * Run all due, enabled jobs. Returns a summary of what ran.
 * Concurrency-safe enough for a single instance: we mark a job "running" with a
 * freshly-advanced nextRunAt before executing, so an overlapping tick won't
 * double-fire it.
 */
export async function runDueJobs(now: Date = new Date()): Promise<{ ran: any[]; checked: number }> {
  // Always run the hard-coded core refreshes that are due.
  const coreRan = await runDueCoreJobs(now).catch(() => [] as any[]);

  // One-time cleanup: remove any legacy CronJob rows of the core types — those
  // are now hard-coded and must not also run from the table (would double-fire).
  await prisma.cronJob.deleteMany({ where: { type: { in: CORE_TYPES } } }).catch(() => {});

  const due = await prisma.cronJob.findMany({
    where: { enabled: true, type: { notIn: CORE_TYPES }, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
  });

  const ran: any[] = [];
  for (const job of due) {
    const handler = JOB_HANDLERS[job.type];
    // Reserve the job: advance nextRunAt + mark running BEFORE executing.
    const reserved = await prisma.cronJob.updateMany({
      where: { id: job.id, nextRunAt: job.nextRunAt },
      data: { lastStatus: 'running', nextRunAt: nextRunFrom(job.schedule, now) },
    });
    if (reserved.count === 0) continue; // another tick grabbed it

    if (!handler) {
      await prisma.cronJob.update({
        where: { id: job.id },
        data: { lastStatus: 'error', lastError: `unknown job type: ${job.type}`, lastRunAt: now },
      });
      ran.push({ id: job.id, name: job.name, status: 'error', error: 'unknown type' });
      continue;
    }

    try {
      const result = await handler.run();
      await prisma.cronJob.update({
        where: { id: job.id },
        data: { lastStatus: 'ok', lastResult: result ?? {}, lastError: null, lastRunAt: new Date() },
      });
      ran.push({ id: job.id, name: job.name, status: 'ok', result });
    } catch (e: any) {
      await prisma.cronJob.update({
        where: { id: job.id },
        data: { lastStatus: 'error', lastError: e?.message ?? 'job failed', lastRunAt: new Date() },
      });
      ran.push({ id: job.id, name: job.name, status: 'error', error: e?.message });
    }
  }
  return { ran: [...coreRan, ...ran], checked: due.length + CORE_JOBS.length };
}
