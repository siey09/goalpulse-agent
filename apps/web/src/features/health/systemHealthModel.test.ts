import { describe, expect, it } from "vitest";
import {
  deriveHealthIncidents,
  deriveHealthStages,
  formatHealthDuration,
  formatHealthTime,
  summarizeHealthVerdict,
  type FeedHealth,
  type SystemMetrics,
} from "./systemHealthModel";

const feedHealth: FeedHealth = {
  status: "healthy",
  cycleHealth: {
    lastRunAt: "2026-07-16T07:00:00.000Z",
    cycleGapMs: 3_000,
    expectedIntervalMs: 3_000,
    isRunInProgress: false,
    isCurrentGapExceeded: false,
    recentMissedCycles: 0,
  },
  oddsFreshness: {
    staleThresholdMs: 300_000,
    staleLiveMatchCount: 0,
    staleLiveMatches: [],
  },
  fixtureCoverage: {
    lastRunRawFixtureCount: 7,
    lastRunEligibleFixtureCount: 2,
    lastRunProcessedCount: 2,
    lastRunOddsEnrichmentFailures: 0,
    isCoverageDropped: false,
    recentCoverageDrops: 0,
  },
};

const metrics: SystemMetrics = {
  uptimeSeconds: 3661,
  lastAgentCycle: {
    startedAt: "2026-07-16T07:00:00.000Z",
    finishedAt: "2026-07-16T07:00:01.200Z",
    decisionLatencyMs: 1200,
  },
  liveStream: { connected: true, staleForMs: 2000, totalReconnects: 0, status: "STREAMING" },
  liveOddsStream: { connected: true, staleForMs: 3000, totalReconnects: 0, status: "STREAMING" },
  duplicatesDropped: { snapshots: 3, signals: 1 },
};

describe("systemHealthModel", () => {
  it("formats durations and rejects invalid timestamps honestly", () => {
    expect(formatHealthDuration(3_661_000)).toBe("1h 1m");
    expect(formatHealthDuration(null)).toBe("Unavailable");
    expect(formatHealthTime("not-a-date")).toBe("Time unavailable");
  });

  it("keeps error precedence above degraded and healthy", () => {
    const stages = deriveHealthStages({
      health: { ok: true },
      feedHealth: {
        ...feedHealth,
        cycleHealth: { ...feedHealth.cycleHealth, isCurrentGapExceeded: true },
        fixtureCoverage: { ...feedHealth.fixtureCoverage, recentCoverageDrops: 2 },
      },
      archiveStatus: { pending: 3, failures: 1, lastFailureAt: null },
    });

    expect(stages.map((stage) => [stage.id, stage.status])).toEqual([
      ["api", "healthy"],
      ["cycle", "down"],
      ["fixtures", "degraded"],
      ["odds", "healthy"],
      ["archive", "down"],
    ]);
  });

  it("does not call missing feed health healthy", () => {
    expect(summarizeHealthVerdict(null)).toEqual({ label: "Unavailable", tone: "unknown" });
    expect(summarizeHealthVerdict(feedHealth)).toEqual({ label: "Healthy", tone: "healthy" });
  });

  it("shows an active cycle as running instead of overdue", () => {
    const stages = deriveHealthStages({
      health: { ok: true },
      feedHealth: {
        ...feedHealth,
        cycleHealth: {
          ...feedHealth.cycleHealth,
          cycleGapMs: 0,
          isRunInProgress: true,
        },
      },
      archiveStatus: { pending: 0, failures: 0, lastFailureAt: null },
    });

    expect(stages.find((stage) => stage.id === "cycle")).toMatchObject({
      status: "healthy",
      value: "Running",
      detail: "Current cycle is actively processing",
    });
  });

  it("treats stopped streams as intentional when simulated mode is on", () => {
    const stoppedMetrics: SystemMetrics = {
      ...metrics,
      liveStream: { connected: false, staleForMs: null, totalReconnects: 0, status: "STOPPED" },
      liveOddsStream: { connected: false, staleForMs: null, totalReconnects: 0, status: "STOPPED" },
    };

    expect(deriveHealthIncidents({
      health: { useSimulatedFeed: true },
      metrics: stoppedMetrics,
      feedHealth,
      archiveStatus: null,
    })).toEqual([]);
  });

  it("derives incidents only from explicit failure evidence", () => {
    const incidents = deriveHealthIncidents({
      health: { useSimulatedFeed: false },
      metrics: {
        ...metrics,
        liveStream: { connected: false, staleForMs: 45_000, totalReconnects: 2, status: "RECONNECTING" },
      },
      feedHealth: {
        ...feedHealth,
        cycleHealth: { ...feedHealth.cycleHealth, recentMissedCycles: 2 },
        oddsFreshness: { ...feedHealth.oddsFreshness, staleLiveMatchCount: 3 },
      },
      archiveStatus: { pending: 4, failures: 0, lastFailureAt: null },
    });

    expect(incidents.map((incident) => incident.id)).toEqual([
      "cycle-missed",
      "odds-stale",
      "push-stream-reconnecting",
      "archive-pending",
    ]);
  });

  it("explains eligible coverage separately from raw discovery", () => {
    const incidents = deriveHealthIncidents({
      health: { useSimulatedFeed: false },
      metrics,
      feedHealth: {
        ...feedHealth,
        fixtureCoverage: {
          ...feedHealth.fixtureCoverage,
          lastRunEligibleFixtureCount: 3,
          lastRunProcessedCount: 2,
          isCoverageDropped: true,
        },
      },
      archiveStatus: { pending: 0, failures: 0, lastFailureAt: null },
    });

    expect(incidents.find((incident) => incident.id === "fixture-drop-current")?.evidence)
      .toBe("2 of 3 odds-eligible fixtures were processed; 7 raw fixtures were discovered.");
  });
});
