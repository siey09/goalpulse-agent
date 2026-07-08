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
/**
 * Generic session-windowing: sorts items by timestamp, then starts a new
 * group whenever the gap to the previous item in the current group
 * exceeds windowMs. Shared by findSignalClusters (any signals close in
 * time across matches) and findPatternMatchedClusters (only signals
 * sharing the same side/severity/market, so the "same pattern repeating"
 * question can reuse the exact same windowing algorithm).
 */
export function sessionWindowGroups<T>(
  items: T[],
  getTimestamp: (item: T) => string,
  windowMs: number
): T[][] {
  const sorted = [...items].sort(
    (a, b) => new Date(getTimestamp(a)).getTime() - new Date(getTimestamp(b)).getTime()
  );

  const groups: T[][] = [];
  let current: T[] = [];

  for (const item of sorted) {
    if (current.length === 0) {
      current = [item];
      continue;
    }

    const lastItem = current[current.length - 1];
    const gapMs =
      new Date(getTimestamp(item)).getTime() - new Date(getTimestamp(lastItem)).getTime();

    if (gapMs <= windowMs) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
  }

  if (current.length > 0) groups.push(current);

  return groups;
}

export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const groups = sessionWindowGroups(signals, (signal) => signal.createdAt, windowMs);

  return groups
    .filter((group) => new Set(group.map((signal) => signal.matchId)).size >= 2)
    .map(buildCluster);
}
