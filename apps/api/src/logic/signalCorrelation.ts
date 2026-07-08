import type { AgentSignal, Severity } from "../types";

export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

export interface SignalCluster {
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  severityBreakdown: { high: number; medium: number; low: number };
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
}

function severityKey(severity: Severity): "high" | "medium" | "low" | null {
  if (severity === "HIGH") return "high";
  if (severity === "MEDIUM") return "medium";
  if (severity === "LOW") return "low";
  return null;
}

function buildCluster(group: AgentSignal[]): SignalCluster {
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();
  const severityBreakdown = { high: 0, medium: 0, low: 0 };

  for (const signal of group) {
    if (!seenMatchIds.has(signal.matchId)) {
      seenMatchIds.add(signal.matchId);
      matchIds.push(signal.matchId);
    }

    const key = severityKey(signal.severity);
    if (key) severityBreakdown[key] += 1;
  }

  const windowStart = group[0].createdAt;
  const windowEnd = group[group.length - 1].createdAt;

  return {
    matchIds,
    matchCount: matchIds.length,
    signalCount: group.length,
    severityBreakdown,
    windowStart,
    windowEnd,
    spanMs: new Date(windowEnd).getTime() - new Date(windowStart).getTime(),
    signalIds: group.map((signal) => signal.id),
  };
}

/**
 * Groups the entire stored signal history via session-windowing: sorted by
 * createdAt, a new group starts whenever the gap to the previous signal in
 * the current group exceeds windowMs. A steady trickle of correlated
 * signals can therefore span longer than windowMs in total, as long as no
 * single gap between consecutive signals exceeds it. Only groups spanning
 * 2+ distinct matchIds are reported - a single match firing multiple
 * signals in a row is normal, already-covered signal-engine behavior, not
 * cross-match correlation.
 */
export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const sorted = [...signals].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const groups: AgentSignal[][] = [];
  let current: AgentSignal[] = [];

  for (const signal of sorted) {
    if (current.length === 0) {
      current = [signal];
      continue;
    }

    const lastSignal = current[current.length - 1];
    const gapMs =
      new Date(signal.createdAt).getTime() - new Date(lastSignal.createdAt).getTime();

    if (gapMs <= windowMs) {
      current.push(signal);
    } else {
      groups.push(current);
      current = [signal];
    }
  }

  if (current.length > 0) groups.push(current);

  return groups
    .filter((group) => new Set(group.map((signal) => signal.matchId)).size >= 2)
    .map(buildCluster);
}
