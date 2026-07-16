import type { AgentRun, Match, OddsSnapshot } from "../types";

const MISSED_CYCLE_MULTIPLIER = 3;
const RECENT_HEALTH_RUN_LIMIT = 10;

export const ODDS_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export interface CycleHealth {
  lastRunAt: string | null;
  cycleGapMs: number | null;
  expectedIntervalMs: number;
  isRunInProgress: boolean;
  isCurrentGapExceeded: boolean;
  recentMissedCycles: number;
}

/**
 * agentRuns is expected newest-first (matching store.agentRuns's unshift
 * convention). Health measures idle time, not time spent doing useful work:
 * the current gap starts when the latest run finished, while historical gaps
 * run from an older completion to the next start.
 */
export function assessCycleHealth(
  agentRuns: AgentRun[],
  now: number,
  expectedIntervalMs: number,
  isRunInProgress = false
): CycleHealth {
  const missedThresholdMs = expectedIntervalMs * MISSED_CYCLE_MULTIPLIER;

  if (agentRuns.length === 0) {
    return {
      lastRunAt: null,
      cycleGapMs: null,
      expectedIntervalMs,
      isRunInProgress,
      isCurrentGapExceeded: false,
      recentMissedCycles: 0,
    };
  }

  const lastRunAt = agentRuns[0].finishedAt;
  const cycleGapMs = isRunInProgress ? 0 : now - new Date(lastRunAt).getTime();
  const isCurrentGapExceeded = !isRunInProgress && cycleGapMs > missedThresholdMs;

  const recentRuns = agentRuns.slice(0, RECENT_HEALTH_RUN_LIMIT);
  let recentMissedCycles = 0;
  for (let i = 0; i < recentRuns.length - 1; i += 1) {
    const newer = new Date(recentRuns[i].startedAt).getTime();
    const older = new Date(recentRuns[i + 1].finishedAt).getTime();
    if (newer - older > missedThresholdMs) {
      recentMissedCycles += 1;
    }
  }

  return {
    lastRunAt,
    cycleGapMs,
    expectedIntervalMs,
    isRunInProgress,
    isCurrentGapExceeded,
    recentMissedCycles,
  };
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
  lastRunEligibleFixtureCount: number | null;
  lastRunProcessedCount: number | null;
  lastRunOddsEnrichmentFailures: number;
  isCoverageDropped: boolean;
  recentCoverageDrops: number;
}

/**
 * Raw discovery includes fixtures without a supported market and is context,
 * not a coverage denominator. A drop requires explicit evidence that an
 * odds-eligible fixture was not processed or that odds enrichment failed.
 * Legacy persisted runs without eligibility evidence remain neutral.
 */
export function assessFixtureCoverage(agentRuns: AgentRun[]): FixtureCoverage {
  if (agentRuns.length === 0) {
    return {
      lastRunRawFixtureCount: null,
      lastRunEligibleFixtureCount: null,
      lastRunProcessedCount: null,
      lastRunOddsEnrichmentFailures: 0,
      isCoverageDropped: false,
      recentCoverageDrops: 0,
    };
  }

  const hasCoverageDrop = (run: AgentRun) =>
    run.eligibleFixtureCount !== undefined &&
    (run.eligibleFixtureCount > run.matchesProcessed ||
      (run.oddsEnrichmentFailures ?? 0) > 0);

  const lastRun = agentRuns[0];
  const isCoverageDropped = hasCoverageDrop(lastRun);
  const recentCoverageDrops = agentRuns
    .slice(0, RECENT_HEALTH_RUN_LIMIT)
    .filter(hasCoverageDrop).length;

  return {
    lastRunRawFixtureCount: lastRun.rawFixtureCount,
    lastRunEligibleFixtureCount: lastRun.eligibleFixtureCount ?? null,
    lastRunProcessedCount: lastRun.matchesProcessed,
    lastRunOddsEnrichmentFailures: lastRun.oddsEnrichmentFailures ?? 0,
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
