import type { AgentRun, Match, OddsSnapshot } from "../types";

const MISSED_CYCLE_MULTIPLIER = 3;

export const ODDS_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export interface CycleHealth {
  lastRunAt: string | null;
  cycleGapMs: number | null;
  expectedIntervalMs: number;
  isCurrentGapExceeded: boolean;
  recentMissedCycles: number;
}

/**
 * agentRuns is expected newest-first (matching store.agentRuns's unshift
 * convention). A gap - either the current gap since the last run, or any
 * gap between two consecutive historical runs - counts as "missed" when it
 * exceeds 3x the expected interval, generous enough to absorb normal jitter
 * (a slow TxLINE response, a GC pause) without false-positiving on every
 * cycle.
 */
export function assessCycleHealth(
  agentRuns: AgentRun[],
  now: number,
  expectedIntervalMs: number
): CycleHealth {
  const missedThresholdMs = expectedIntervalMs * MISSED_CYCLE_MULTIPLIER;

  if (agentRuns.length === 0) {
    return {
      lastRunAt: null,
      cycleGapMs: null,
      expectedIntervalMs,
      isCurrentGapExceeded: false,
      recentMissedCycles: 0,
    };
  }

  const lastRunAt = agentRuns[0].startedAt;
  const cycleGapMs = now - new Date(lastRunAt).getTime();
  const isCurrentGapExceeded = cycleGapMs > missedThresholdMs;

  let recentMissedCycles = 0;
  for (let i = 0; i < agentRuns.length - 1; i += 1) {
    const newer = new Date(agentRuns[i].startedAt).getTime();
    const older = new Date(agentRuns[i + 1].startedAt).getTime();
    if (newer - older > missedThresholdMs) {
      recentMissedCycles += 1;
    }
  }

  return { lastRunAt, cycleGapMs, expectedIntervalMs, isCurrentGapExceeded, recentMissedCycles };
}

export interface StaleLiveMatch {
  matchId: string;
  match: string;
  lastOddsAt: string;
  staleForMs: number;
}

export interface OddsFreshness {
  staleThresholdMs: number;
  staleLiveMatchCount: number;
  staleLiveMatches: StaleLiveMatch[];
}

/**
 * A Match's own lastUpdated can't go stale while present in store.matches
 * (it's wholesale-replaced and re-stamped every cycle) - the signal that
 * actually can go stale is a live match's most recent odds snapshot. A live
 * match with no odds snapshot at all is not flagged - there is nothing to
 * compare against, and absence of data is not evidence of bad data (see
 * marketMaker.ts's UNKNOWN reliability precedent).
 */
export function assessOddsFreshness(
  matches: Match[],
  oddsSnapshots: OddsSnapshot[],
  now: number,
  staleThresholdMs: number
): OddsFreshness {
  const staleLiveMatches: StaleLiveMatch[] = [];

  for (const match of matches) {
    if (match.status !== "live") continue;

    const latestSnapshot = oddsSnapshots
      .filter((snapshot) => snapshot.matchId === match.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!latestSnapshot) continue;

    const staleForMs = now - new Date(latestSnapshot.createdAt).getTime();

    if (staleForMs > staleThresholdMs) {
      staleLiveMatches.push({
        matchId: match.id,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        lastOddsAt: latestSnapshot.createdAt,
        staleForMs,
      });
    }
  }

  return {
    staleThresholdMs,
    staleLiveMatchCount: staleLiveMatches.length,
    staleLiveMatches,
  };
}

export interface FixtureCoverage {
  lastRunRawFixtureCount: number | null;
  lastRunProcessedCount: number | null;
  isCoverageDropped: boolean;
  recentCoverageDrops: number;
}

/**
 * A drop is rawFixtureCount > matchesProcessed on a given run -
 * self-contained, never hardcodes the underlying 14-fixture cap constant,
 * so it stays correct even if that constant changes elsewhere.
 */
export function assessFixtureCoverage(agentRuns: AgentRun[]): FixtureCoverage {
  if (agentRuns.length === 0) {
    return {
      lastRunRawFixtureCount: null,
      lastRunProcessedCount: null,
      isCoverageDropped: false,
      recentCoverageDrops: 0,
    };
  }

  const lastRun = agentRuns[0];
  const isCoverageDropped = lastRun.rawFixtureCount > lastRun.matchesProcessed;
  const recentCoverageDrops = agentRuns.filter(
    (run) => run.rawFixtureCount > run.matchesProcessed
  ).length;

  return {
    lastRunRawFixtureCount: lastRun.rawFixtureCount,
    lastRunProcessedCount: lastRun.matchesProcessed,
    isCoverageDropped,
    recentCoverageDrops,
  };
}

/**
 * "down" overrides everything else - a dead scheduler makes the other two
 * checks moot, since no new data is coming in at all.
 */
export function computeFeedHealthStatus(
  cycleHealth: CycleHealth,
  oddsFreshness: OddsFreshness,
  fixtureCoverage: FixtureCoverage
): "healthy" | "degraded" | "down" {
  if (cycleHealth.isCurrentGapExceeded) return "down";

  const isDegraded =
    cycleHealth.recentMissedCycles > 0 ||
    oddsFreshness.staleLiveMatchCount > 0 ||
    fixtureCoverage.isCoverageDropped ||
    fixtureCoverage.recentCoverageDrops > 0;

  return isDegraded ? "degraded" : "healthy";
}
