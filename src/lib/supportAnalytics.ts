import { prisma } from "@/lib/prisma";

/**
 * Deterministic support analytics over SupportThread / SupportMessage, bounded by a
 * date range. Powers the v1 support dashboard: volume, response/resolution times,
 * backlog, label/topic breakdown, assignee workload.
 *
 * Timing note: Plain gives us firstInboundAt / firstOutboundAt / statusChangedAt on the
 * thread, so first-response and resolution times don't require walking the message table.
 */

export interface SupportRange { from: Date; to: Date }

export interface SupportDashboard {
  range: { from: string; to: string };
  totals: {
    created: number;          // threads created in range
    open: number;             // currently TODO (point-in-time, not range-bound)
    snoozed: number;
    done: number;
    resolvedInRange: number;  // threads moved to DONE within range
  };
  volumeByDay: { date: string; count: number }[];
  volumeByChannel: { channel: string; count: number }[];
  responseTimes: {
    firstResponseMedianMin: number | null;
    firstResponseP90Min: number | null;
    resolutionMedianHours: number | null;
    resolutionP90Hours: number | null;
    measuredFirstResponse: number;   // sample sizes
    measuredResolution: number;
  };
  backlog: { todo: number; snoozed: number; done: number };
  byLabel: { label: string; count: number }[];
  byAssignee: { assignee: string; assigneeType: string; open: number; total: number }[];
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }

export async function computeSupportDashboard(range: SupportRange): Promise<SupportDashboard> {
  const { from, to } = range;

  // Threads created in the window (volume, response timing, labels, channel).
  const created = await prisma.supportThread.findMany({
    where: { plainCreatedAt: { gte: from, lte: to } },
    select: {
      id: true, plainCreatedAt: true, channel: true, labelNames: true,
      firstInboundAt: true, firstOutboundAt: true, status: true, statusChangedAt: true,
      assigneeId: true, assigneeName: true, assigneeType: true,
    },
  });

  // Point-in-time backlog (current status across ALL threads, not range-bound).
  const [todo, snoozed, doneAll] = await Promise.all([
    prisma.supportThread.count({ where: { status: "TODO" } }),
    prisma.supportThread.count({ where: { status: "SNOOZED" } }),
    prisma.supportThread.count({ where: { status: "DONE" } }),
  ]);

  // Threads resolved (moved to DONE) within the range.
  const resolvedInRange = await prisma.supportThread.count({
    where: { status: "DONE", statusChangedAt: { gte: from, lte: to } },
  });

  // ── Volume by day ──
  const dayMap = new Map<string, number>();
  for (const t of created) {
    if (!t.plainCreatedAt) continue;
    const k = dayKey(t.plainCreatedAt);
    dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
  }
  // fill empty days across the range for a continuous chart
  const volumeByDay: { date: string; count: number }[] = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = dayKey(d);
    volumeByDay.push({ date: k, count: dayMap.get(k) ?? 0 });
  }

  // ── Volume by channel ──
  const KNOWN_CHANNELS = new Set(["EMAIL", "CHAT", "SLACK", "DISCORD", "MS_TEAMS", "API"]);
  const chanMap = new Map<string, number>();
  for (const t of created) {
    // Normalize: anything not a recognized channel (incl. Plain's messageInfo enum
    // discriminators from before the channel-mapping fix) buckets as "Unknown".
    const raw = (t.channel || "").toUpperCase();
    const c = KNOWN_CHANNELS.has(raw) ? raw : "Unknown";
    chanMap.set(c, (chanMap.get(c) ?? 0) + 1);
  }
  const volumeByChannel = Array.from(chanMap.entries()).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

  // ── Response / resolution times ──
  const frtMins: number[] = [];
  const resHours: number[] = [];
  for (const t of created) {
    if (t.firstInboundAt && t.firstOutboundAt && t.firstOutboundAt > t.firstInboundAt) {
      frtMins.push((t.firstOutboundAt.getTime() - t.firstInboundAt.getTime()) / 60000);
    }
    if (t.status === "DONE" && t.statusChangedAt && t.plainCreatedAt && t.statusChangedAt > t.plainCreatedAt) {
      resHours.push((t.statusChangedAt.getTime() - t.plainCreatedAt.getTime()) / 3600000);
    }
  }

  // ── Labels (topic breakdown) ──
  const labelMap = new Map<string, number>();
  for (const t of created) {
    for (const l of t.labelNames || []) labelMap.set(l, (labelMap.get(l) ?? 0) + 1);
  }
  const byLabel = Array.from(labelMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  // ── Assignee workload ── (open = currently TODO assigned to them; total = created in range)
  const asgMap = new Map<string, { name: string; type: string; open: number; total: number }>();
  for (const t of created) {
    if (!t.assigneeId) continue;
    const key = t.assigneeId;
    const cur = asgMap.get(key) ?? { name: t.assigneeName || t.assigneeId, type: t.assigneeType || "user", open: 0, total: 0 };
    cur.total += 1;
    if (t.status === "TODO") cur.open += 1;
    asgMap.set(key, cur);
  }
  const byAssignee = Array.from(asgMap.values())
    .map((v) => ({ assignee: v.name, assigneeType: v.type, open: v.open, total: v.total }))
    .sort((a, b) => b.total - a.total);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: { created: created.length, open: todo, snoozed, done: doneAll, resolvedInRange },
    volumeByDay,
    volumeByChannel,
    responseTimes: {
      firstResponseMedianMin: median(frtMins) != null ? Math.round(median(frtMins)!) : null,
      firstResponseP90Min: percentile(frtMins, 90) != null ? Math.round(percentile(frtMins, 90)!) : null,
      resolutionMedianHours: median(resHours) != null ? Math.round(median(resHours)! * 10) / 10 : null,
      resolutionP90Hours: percentile(resHours, 90) != null ? Math.round(percentile(resHours, 90)! * 10) / 10 : null,
      measuredFirstResponse: frtMins.length,
      measuredResolution: resHours.length,
    },
    backlog: { todo, snoozed, done: doneAll },
    byLabel,
    byAssignee,
  };
}
