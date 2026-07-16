import { describe, expect, it } from "vitest";
import {
  assessCycleHealth,
  assessOddsFreshness,
  assessFixtureCoverage,
  computeFeedHealthStatus,
} from "./feedHealth";
import type { AgentRun, Match, OddsSnapshot } from "../types";

const NOW = new Date("2026-07-08T12:00:00.000Z").getTime();

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    startedAt: iso(0),
    finishedAt: iso(0),
    matchesProcessed: 5,
    snapshotsCreated: 2,
    signalsCreated: 1,
    rawFixtureCount: 5,
    status: "success",
    message: "ok",
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "live",
    lastUpdated: iso(0),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.0,
    drawOdds: 3.5,
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    source: "txline",
    createdAt: iso(0),
    ...overrides,
  };
}

describe("assessCycleHealth", () => {
  it("returns nulls and no exceeded gap for an empty run history", () => {
    expect(assessCycleHealth([], NOW, 5000)).toEqual({
      lastRunAt: null,
      cycleGapMs: null,
      expectedIntervalMs: 5000,
      isRunInProgress: false,
      isCurrentGapExceeded: false,
      recentMissedCycles: 0,
    });
  });

  it("does not flag a current gap within the 3x threshold", () => {
    const runs = [makeRun({ startedAt: iso(10000), finishedAt: iso(2000) })];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(false);
    expect(result.cycleGapMs).toBe(2000);
    expect(result.recentMissedCycles).toBe(0);
  });

  it("flags a current gap beyond the 3x threshold", () => {
    const runs = [makeRun({ startedAt: iso(28000), finishedAt: iso(20000) })];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(true);
    expect(result.cycleGapMs).toBe(20000);
  });

  it("counts a historical gap between two older runs as a missed cycle", () => {
    const runs = [
      makeRun({ startedAt: iso(0), finishedAt: iso(0) }),
      makeRun({ startedAt: iso(6000), finishedAt: iso(5000) }),
      makeRun({ startedAt: iso(100000), finishedAt: iso(90000) }),
    ];
    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.isCurrentGapExceeded).toBe(false);
    expect(result.recentMissedCycles).toBe(1);
  });

  it("ignores missed gaps outside the last ten-run recovery window", () => {
    const cleanRuns = Array.from({ length: 10 }, (_, index) =>
      makeRun({
        startedAt: iso(index * 6_000),
        finishedAt: iso(Math.max(0, index * 6_000 - 1_000)),
      })
    );
    const olderRuns = [
      makeRun({ startedAt: iso(100_000), finishedAt: iso(99_000) }),
      makeRun({ startedAt: iso(200_000), finishedAt: iso(199_000) }),
    ];

    expect(assessCycleHealth([...cleanRuns, ...olderRuns], NOW, 5_000).recentMissedCycles)
      .toBe(0);
  });

  it("does not count a long-running cycle as idle time", () => {
    const runs = [
      makeRun({ startedAt: iso(13000), finishedAt: iso(5000) }),
      makeRun({ startedAt: iso(26000), finishedAt: iso(18000) }),
    ];

    const result = assessCycleHealth(runs, NOW, 5000);

    expect(result.cycleGapMs).toBe(5000);
    expect(result.isCurrentGapExceeded).toBe(false);
    expect(result.recentMissedCycles).toBe(0);
  });

  it("does not call an active cycle an overdue idle scheduler", () => {
    const runs = [makeRun({ startedAt: iso(28000), finishedAt: iso(20000) })];

    const result = assessCycleHealth(runs, NOW, 5000, true);

    expect(result.cycleGapMs).toBe(0);
    expect(result.isRunInProgress).toBe(true);
    expect(result.isCurrentGapExceeded).toBe(false);
  });
});

describe("assessOddsFreshness", () => {
  it("reports no stale matches when there are no live matches", () => {
    const matches = [makeMatch({ status: "scheduled" })];
    const result = assessOddsFreshness(matches, [], NOW, 300000);

    expect(result).toEqual({
      staleThresholdMs: 300000,
      staleLiveMatchCount: 0,
      staleLiveMatches: [],
    });
  });

  it("does not flag a live match with a fresh snapshot", () => {
    const matches = [makeMatch({ status: "live" })];
    const snapshots = [makeSnapshot({ createdAt: iso(1000) })];
    const result = assessOddsFreshness(matches, snapshots, NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(0);
  });

  it("flags a live match whose latest snapshot exceeds the threshold", () => {
    const matches = [makeMatch({ id: "match-1", homeTeam: "Team A", awayTeam: "Team B", status: "live" })];
    const snapshots = [makeSnapshot({ matchId: "match-1", createdAt: iso(400000) })];
    const result = assessOddsFreshness(matches, snapshots, NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(1);
    expect(result.staleLiveMatches).toEqual([
      {
        matchId: "match-1",
        match: "Team A vs Team B",
        lastOddsAt: iso(400000),
        staleForMs: 400000,
      },
    ]);
  });

  it("does not flag a live match with no odds snapshot at all", () => {
    const matches = [makeMatch({ id: "match-2", status: "live" })];
    const result = assessOddsFreshness(matches, [], NOW, 300000);

    expect(result.staleLiveMatchCount).toBe(0);
  });
});

describe("assessFixtureCoverage", () => {
  it("returns nulls and no drop for an empty run history", () => {
    expect(assessFixtureCoverage([])).toEqual({
      lastRunRawFixtureCount: null,
      lastRunEligibleFixtureCount: null,
      lastRunProcessedCount: null,
      lastRunOddsEnrichmentFailures: 0,
      isCoverageDropped: false,
      recentCoverageDrops: 0,
    });
  });

  it("reports no drop when every odds-eligible fixture is processed", () => {
    const runs = [makeRun({
      rawFixtureCount: 9,
      eligibleFixtureCount: 4,
      matchesProcessed: 4,
      oddsEnrichmentFailures: 0,
    })];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(false);
    expect(result.lastRunEligibleFixtureCount).toBe(4);
    expect(result.recentCoverageDrops).toBe(0);
  });

  it("reports a drop when an odds-eligible fixture is not processed", () => {
    const runs = [makeRun({
      rawFixtureCount: 16,
      eligibleFixtureCount: 15,
      matchesProcessed: 14,
      oddsEnrichmentFailures: 0,
    })];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(true);
    expect(result.lastRunRawFixtureCount).toBe(16);
    expect(result.lastRunEligibleFixtureCount).toBe(15);
    expect(result.lastRunProcessedCount).toBe(14);
    expect(result.recentCoverageDrops).toBe(1);
  });

  it("reports a drop when odds enrichment failed even if eligible fixtures were processed", () => {
    const runs = [makeRun({
      rawFixtureCount: 7,
      eligibleFixtureCount: 2,
      matchesProcessed: 2,
      oddsEnrichmentFailures: 1,
    })];

    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(true);
    expect(result.lastRunOddsEnrichmentFailures).toBe(1);
  });

  it("treats legacy runs without eligibility evidence as neutral", () => {
    const runs = [makeRun({ rawFixtureCount: 7, matchesProcessed: 2 })];

    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(false);
    expect(result.lastRunEligibleFixtureCount).toBeNull();
    expect(result.recentCoverageDrops).toBe(0);
  });

  it("counts multiple historical drops but reports isCoverageDropped only for the last run", () => {
    const runs = [
      makeRun({ rawFixtureCount: 9, eligibleFixtureCount: 4, matchesProcessed: 4, oddsEnrichmentFailures: 0 }),
      makeRun({ rawFixtureCount: 18, eligibleFixtureCount: 15, matchesProcessed: 14, oddsEnrichmentFailures: 0 }),
      makeRun({ rawFixtureCount: 20, eligibleFixtureCount: 14, matchesProcessed: 14, oddsEnrichmentFailures: 1 }),
    ];
    const result = assessFixtureCoverage(runs);

    expect(result.isCoverageDropped).toBe(false);
    expect(result.recentCoverageDrops).toBe(2);
  });

  it("lets old fixture drops recover after ten clean runs", () => {
    const cleanRuns = Array.from({ length: 10 }, () =>
      makeRun({ eligibleFixtureCount: 2, matchesProcessed: 2, oddsEnrichmentFailures: 0 })
    );
    const oldDrop = makeRun({
      eligibleFixtureCount: 3,
      matchesProcessed: 2,
      oddsEnrichmentFailures: 0,
    });

    expect(assessFixtureCoverage([...cleanRuns, oldDrop]).recentCoverageDrops).toBe(0);
  });
});

describe("computeFeedHealthStatus", () => {
  const healthyCycle = { lastRunAt: iso(0), cycleGapMs: 2000, expectedIntervalMs: 5000, isRunInProgress: false, isCurrentGapExceeded: false, recentMissedCycles: 0 };
  const healthyOdds = { staleThresholdMs: 300000, staleLiveMatchCount: 0, staleLiveMatches: [] };
  const healthyCoverage = { lastRunRawFixtureCount: 9, lastRunEligibleFixtureCount: 4, lastRunProcessedCount: 4, lastRunOddsEnrichmentFailures: 0, isCoverageDropped: false, recentCoverageDrops: 0 };

  it("returns healthy when all three checks are clean", () => {
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, healthyCoverage)).toBe("healthy");
  });

  it("returns down when the current cycle gap is exceeded, regardless of the others", () => {
    const downCycle = { ...healthyCycle, isCurrentGapExceeded: true };
    expect(computeFeedHealthStatus(downCycle, healthyOdds, healthyCoverage)).toBe("down");
  });

  it("returns degraded when there are historical missed cycles", () => {
    const degradedCycle = { ...healthyCycle, recentMissedCycles: 1 };
    expect(computeFeedHealthStatus(degradedCycle, healthyOdds, healthyCoverage)).toBe("degraded");
  });

  it("returns degraded when there are stale live matches", () => {
    const degradedOdds = { ...healthyOdds, staleLiveMatchCount: 1 };
    expect(computeFeedHealthStatus(healthyCycle, degradedOdds, healthyCoverage)).toBe("degraded");
  });

  it("returns degraded when the last run's coverage was dropped", () => {
    const degradedCoverage = { ...healthyCoverage, isCoverageDropped: true };
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, degradedCoverage)).toBe("degraded");
  });

  it("returns degraded when there are recent historical coverage drops even if the last run was clean", () => {
    const degradedCoverage = { ...healthyCoverage, recentCoverageDrops: 2 };
    expect(computeFeedHealthStatus(healthyCycle, healthyOdds, degradedCoverage)).toBe("degraded");
  });
});
