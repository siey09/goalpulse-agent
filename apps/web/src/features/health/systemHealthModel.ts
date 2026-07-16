import type { Health } from "../../types";

export type StreamStatus = "STREAMING" | "STALE" | "RECONNECTING" | "STOPPED";

export interface MetricsStreamState {
  connected: boolean;
  staleForMs: number | null;
  totalReconnects: number;
  status: StreamStatus;
}

export interface SystemMetrics {
  uptimeSeconds: number;
  lastAgentCycle: {
    startedAt: string;
    finishedAt: string;
    decisionLatencyMs: number;
  } | null;
  liveStream: MetricsStreamState;
  liveOddsStream: MetricsStreamState;
  duplicatesDropped: {
    snapshots: number;
    signals: number;
  };
}

export interface FeedHealth {
  status: "healthy" | "degraded" | "down";
  cycleHealth: {
    lastRunAt: string | null;
    cycleGapMs: number | null;
    expectedIntervalMs: number;
    isRunInProgress: boolean;
    isCurrentGapExceeded: boolean;
    recentMissedCycles: number;
  };
  oddsFreshness: {
    staleThresholdMs: number;
    staleLiveMatchCount: number;
    staleLiveMatches: Array<{
      matchId: string;
      match: string;
      lastOddsAt: string;
      staleForMs: number;
    }>;
  };
  fixtureCoverage: {
    lastRunRawFixtureCount: number | null;
    lastRunEligibleFixtureCount: number | null;
    lastRunProcessedCount: number | null;
    lastRunOddsEnrichmentFailures: number;
    isCoverageDropped: boolean;
    recentCoverageDrops: number;
  };
}

export interface ArchiveHealthSummary {
  pending: number;
  failures: number;
  lastFailureAt: string | null;
}

export type HealthStageStatus = "healthy" | "degraded" | "down" | "unknown";
export type HealthIncidentSeverity = "critical" | "warning";

export interface HealthStage {
  id: "api" | "cycle" | "fixtures" | "odds" | "archive";
  label: string;
  status: HealthStageStatus;
  value: string;
  detail: string;
}

export interface HealthIncident {
  id: string;
  severity: HealthIncidentSeverity;
  title: string;
  evidence: string;
}

export function formatHealthDuration(valueMs: number | null | undefined): string {
  if (valueMs === null || valueMs === undefined || !Number.isFinite(valueMs) || valueMs < 0) {
    return "Unavailable";
  }

  if (valueMs < 1_000) return `${Math.round(valueMs)}ms`;

  const totalSeconds = Math.floor(valueMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`;

  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${totalMinutes % 60}m`;
}

export function formatHealthTime(value: string | null | undefined): string {
  if (!value) return "Time unavailable";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "Time unavailable";
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function deriveHealthStages(input: {
  health: Health | null;
  feedHealth: FeedHealth | null;
  archiveStatus: ArchiveHealthSummary | null;
}): HealthStage[] {
  const { health, feedHealth, archiveStatus } = input;
  const cycle = feedHealth?.cycleHealth;
  const coverage = feedHealth?.fixtureCoverage;
  const odds = feedHealth?.oddsFreshness;

  const apiStatus: HealthStageStatus = health?.ok === true ? "healthy" : health?.ok === false ? "down" : "unknown";
  const cycleStatus: HealthStageStatus = !cycle
    ? "unknown"
    : cycle.isCurrentGapExceeded
      ? "down"
      : cycle.recentMissedCycles > 0
        ? "degraded"
        : "healthy";
  const fixtureStatus: HealthStageStatus = !coverage
    ? "unknown"
    : coverage.isCoverageDropped
      ? "down"
      : coverage.recentCoverageDrops > 0
        ? "degraded"
        : "healthy";
  const oddsStatus: HealthStageStatus = !odds
    ? "unknown"
    : odds.staleLiveMatchCount > 0
      ? "degraded"
      : "healthy";
  const archiveStatusTone: HealthStageStatus = !archiveStatus
    ? "unknown"
    : archiveStatus.failures > 0
      ? "down"
      : archiveStatus.pending > 0
        ? "degraded"
        : "healthy";

  return [
    {
      id: "api",
      label: "API",
      status: apiStatus,
      value: apiStatus === "healthy" ? "Online" : apiStatus === "down" ? "Offline" : "Unavailable",
      detail: "GoalPulse API",
    },
    {
      id: "cycle",
      label: "Agent cycle",
      status: cycleStatus,
      value: cycle?.isRunInProgress ? "Running" : cycle ? formatHealthDuration(cycle.cycleGapMs) : "Unavailable",
      detail: cycle?.isRunInProgress
        ? "Current cycle is actively processing"
        : cycle
          ? `Expected every ${formatHealthDuration(cycle.expectedIntervalMs)}`
          : "No scheduler evidence",
    },
    {
      id: "fixtures",
      label: "Fixture coverage",
      status: fixtureStatus,
      value: coverage?.lastRunProcessedCount !== null && coverage?.lastRunProcessedCount !== undefined && coverage.lastRunEligibleFixtureCount !== null
        ? `${coverage.lastRunProcessedCount}/${coverage.lastRunEligibleFixtureCount}`
        : "Unavailable",
      detail: coverage
        ? `${coverage.lastRunRawFixtureCount ?? "Unknown"} discovered · ${coverage.lastRunOddsEnrichmentFailures} enrichment failure(s)`
        : "No fixture evidence",
    },
    {
      id: "odds",
      label: "Odds freshness",
      status: oddsStatus,
      value: odds ? `${odds.staleLiveMatchCount} stale live` : "Unavailable",
      detail: odds ? `${formatHealthDuration(odds.staleThresholdMs)} stale threshold` : "No odds evidence",
    },
    {
      id: "archive",
      label: "Archive",
      status: archiveStatusTone,
      value: archiveStatus ? `${archiveStatus.pending} pending` : "Unavailable",
      detail: archiveStatus ? `${archiveStatus.failures} write failure(s)` : "No archive evidence",
    },
  ];
}

export function summarizeHealthVerdict(feedHealth: FeedHealth | null): {
  label: "Healthy" | "Degraded" | "Down" | "Unavailable";
  tone: "healthy" | "degraded" | "down" | "unknown";
} {
  if (!feedHealth) return { label: "Unavailable", tone: "unknown" };
  if (feedHealth.status === "healthy") return { label: "Healthy", tone: "healthy" };
  if (feedHealth.status === "degraded") return { label: "Degraded", tone: "degraded" };
  return { label: "Down", tone: "down" };
}

export function deriveHealthIncidents(input: {
  health: Health | null;
  metrics: SystemMetrics | null;
  feedHealth: FeedHealth | null;
  archiveStatus: ArchiveHealthSummary | null;
}): HealthIncident[] {
  const { health, metrics, feedHealth, archiveStatus } = input;
  const incidents: HealthIncident[] = [];
  const cycle = feedHealth?.cycleHealth;
  const coverage = feedHealth?.fixtureCoverage;

  if (cycle?.isCurrentGapExceeded) {
    incidents.push({
      id: "cycle-gap",
      severity: "critical",
      title: "Agent cycle is overdue",
      evidence: `Current gap is ${formatHealthDuration(cycle.cycleGapMs)}; expected ${formatHealthDuration(cycle.expectedIntervalMs)}.`,
    });
  }
  if (cycle && cycle.recentMissedCycles > 0) {
    incidents.push({
      id: "cycle-missed",
      severity: "warning",
      title: "Recent cycles were missed",
      evidence: `${cycle.recentMissedCycles} recent cycle gap(s) crossed the backend threshold.`,
    });
  }
  if (feedHealth && feedHealth.oddsFreshness.staleLiveMatchCount > 0) {
    incidents.push({
      id: "odds-stale",
      severity: "warning",
      title: "Live odds are stale",
      evidence: `${feedHealth.oddsFreshness.staleLiveMatchCount} live match(es) exceed ${formatHealthDuration(feedHealth.oddsFreshness.staleThresholdMs)}.`,
    });
  }
  if (coverage?.isCoverageDropped) {
    const evidenceParts: string[] = [];
    if (
      coverage.lastRunEligibleFixtureCount !== null &&
      (coverage.lastRunProcessedCount ?? 0) < coverage.lastRunEligibleFixtureCount
    ) {
      evidenceParts.push(
        `${coverage.lastRunProcessedCount ?? "Unknown"} of ${coverage.lastRunEligibleFixtureCount} odds-eligible fixtures were processed`
      );
    }
    if (coverage.lastRunOddsEnrichmentFailures > 0) {
      evidenceParts.push(`${coverage.lastRunOddsEnrichmentFailures} odds enrichment request(s) failed`);
    }
    evidenceParts.push(`${coverage.lastRunRawFixtureCount ?? "Unknown"} raw fixtures were discovered`);
    incidents.push({
      id: "fixture-drop-current",
      severity: "critical",
      title: "Current fixture coverage dropped",
      evidence: `${evidenceParts.join("; ")}.`,
    });
  } else if (coverage && coverage.recentCoverageDrops > 0) {
    incidents.push({
      id: "fixture-drop-recent",
      severity: "warning",
      title: "Fixture coverage recently dropped",
      evidence: `${coverage.recentCoverageDrops} recent run(s) lost eligible coverage or had odds enrichment failures.`,
    });
  }

  if (!health?.useSimulatedFeed && metrics) {
    const streamIncidents: Array<["push" | "odds", MetricsStreamState]> = [
      ["push", metrics.liveStream],
      ["odds", metrics.liveOddsStream],
    ];
    for (const [kind, stream] of streamIncidents) {
      if (stream.status !== "STALE" && stream.status !== "RECONNECTING") continue;
      incidents.push({
        id: `${kind}-stream-${stream.status.toLowerCase()}`,
        severity: stream.status === "RECONNECTING" ? "critical" : "warning",
        title: `${kind === "push" ? "TxLINE push" : "Live odds"} stream is ${stream.status.toLowerCase()}`,
        evidence: stream.staleForMs === null
          ? `Backend status is ${stream.status}.`
          : `Backend status is ${stream.status}; last valid event was ${formatHealthDuration(stream.staleForMs)} ago.`,
      });
    }
  }

  if (archiveStatus?.failures) {
    incidents.push({
      id: "archive-failures",
      severity: "critical",
      title: "Archive writes failed",
      evidence: `${archiveStatus.failures} archive write(s) failed; last failure ${formatHealthTime(archiveStatus.lastFailureAt)}.`,
    });
  }
  if (archiveStatus?.pending) {
    incidents.push({
      id: "archive-pending",
      severity: "warning",
      title: "Archive writes are pending",
      evidence: `${archiveStatus.pending} snapshot write(s) remain queued.`,
    });
  }

  return incidents;
}
