import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Health } from "../../types";
import type { FeedHealth, SystemMetrics } from "./systemHealthModel";
import { useSystemObservability } from "./useSystemObservability";
import { SystemHealthPage } from "./SystemHealthPage";

vi.mock("./useSystemObservability", () => ({ useSystemObservability: vi.fn() }));

const metrics: SystemMetrics = {
  uptimeSeconds: 7200,
  lastAgentCycle: {
    startedAt: "2026-07-16T07:00:00.000Z",
    finishedAt: "2026-07-16T07:00:01.200Z",
    decisionLatencyMs: 1200,
  },
  liveStream: { connected: true, staleForMs: 2500, totalReconnects: 1, status: "STREAMING" },
  liveOddsStream: { connected: true, staleForMs: 1800, totalReconnects: 0, status: "STREAMING" },
  duplicatesDropped: { snapshots: 3, signals: 1 },
};

const feedHealth: FeedHealth = {
  status: "healthy",
  cycleHealth: {
    lastRunAt: "2026-07-16T07:00:00.000Z",
    cycleGapMs: 3000,
    expectedIntervalMs: 3000,
    isCurrentGapExceeded: false,
    recentMissedCycles: 0,
  },
  oddsFreshness: { staleThresholdMs: 300_000, staleLiveMatchCount: 0, staleLiveMatches: [] },
  fixtureCoverage: {
    lastRunRawFixtureCount: 7,
    lastRunProcessedCount: 7,
    isCoverageDropped: false,
    recentCoverageDrops: 0,
  },
};

const health = {
  ok: true,
  service: "GoalPulse Agent API",
  status: "running",
  timestamp: "2026-07-16T07:00:02.000Z",
  agentIntervalMs: 3000,
  useSimulatedFeed: false,
  liveStream: {
    connected: true,
    lastEventAt: "2026-07-16T07:00:01.000Z",
    totalEventsReceived: 9354,
    totalReconnects: 1,
    lastError: null,
  },
  liveOddsStream: {
    connected: true,
    lastEventAt: "2026-07-16T07:00:01.000Z",
    totalEventsReceived: 8221,
    totalReconnects: 0,
    lastError: null,
  },
} as Health;

function mockObservability(overrides: Partial<ReturnType<typeof useSystemObservability>> = {}) {
  vi.mocked(useSystemObservability).mockReturnValue({
    metrics,
    feedHealth,
    metricsState: "fresh",
    feedHealthState: "fresh",
    lastSuccessfulRefreshAt: "2026-07-16T07:00:02.000Z",
    ...overrides,
  });
}

describe("SystemHealthPage", () => {
  beforeEach(() => mockObservability());

  it("renders a dense evidence-first operations cockpit", () => {
    const { container } = render(
      <SystemHealthPage
        health={health}
        archiveStatus={{ pending: 0, failures: 0, lastFailureAt: null }}
      />
    );

    expect(screen.getByRole("status", { name: "Overall system health" })).toHaveTextContent("Healthy");
    expect(screen.getByRole("heading", { name: "Operational telemetry" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "System diagnostic pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active incidents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TxLINE push stream" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live odds stream" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Signal threshold reference" })).toBeInTheDocument();
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
    expect(screen.getByText("1s")).toBeInTheDocument();
    expect(screen.getAllByText(/5m 0s/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("7/7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4 total duplicates dropped")).toHaveLength(2);
    expect(screen.getByText("≥ 4%")).toBeInTheDocument();
    expect(screen.getByText("≥ 8%")).toBeInTheDocument();
    expect(screen.getByText("≥ 15%")).toBeInTheDocument();
    expect(screen.queryByText("TxLINE Push Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Status")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Â|â‰¥/);
  });

  it("leads with a down verdict and critical cycle incident", () => {
    mockObservability({
      feedHealth: {
        ...feedHealth,
        status: "down",
        cycleHealth: { ...feedHealth.cycleHealth, cycleGapMs: 12_000, isCurrentGapExceeded: true },
      },
    });

    render(<SystemHealthPage health={health} archiveStatus={{ pending: 0, failures: 0, lastFailureAt: null }} />);

    expect(screen.getByRole("status", { name: "Overall system health" })).toHaveTextContent("Down");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Agent cycle is overdue")).toBeInTheDocument();
  });

  it("never promotes API availability into a healthy verdict", () => {
    mockObservability({ feedHealth: null, feedHealthState: "unavailable" });

    render(<SystemHealthPage health={health} archiveStatus={null} />);

    expect(screen.getByRole("status", { name: "Overall system health" })).toHaveTextContent("Unavailable");
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("No active health incidents.")).not.toBeInTheDocument();
  });

  it("reports all clear only when required evidence is fresh", () => {
    const { rerender } = render(
      <SystemHealthPage health={health} archiveStatus={{ pending: 0, failures: 0, lastFailureAt: null }} />
    );
    expect(screen.getByText("No active health incidents.")).toBeInTheDocument();

    rerender(<SystemHealthPage health={health} archiveStatus={null} />);
    expect(screen.queryByText("No active health incidents.")).not.toBeInTheDocument();
    expect(screen.getByText("Archive data unavailable.")).toBeInTheDocument();
  });

  it("keeps stale values visible with a clear source warning", () => {
    mockObservability({ metricsState: "stale" });

    render(<SystemHealthPage health={health} archiveStatus={{ pending: 0, failures: 0, lastFailureAt: null }} />);

    expect(screen.getByText("Metrics refresh failed; showing the last successful reading.")).toBeInTheDocument();
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
  });

  it("uses responsive grids without fixed-width overflow", () => {
    const { container } = render(
      <SystemHealthPage health={health} archiveStatus={{ pending: 0, failures: 0, lastFailureAt: null }} />
    );

    expect(container.querySelector("[data-testid='health-cockpit-grid']")).toHaveClass("xl:grid-cols-12");
    expect(container.querySelector("[data-testid='health-telemetry-grid']")).toHaveClass("sm:grid-cols-2", "xl:grid-cols-4");
    expect(container.querySelector("[data-testid='health-stream-grid']")).toHaveClass("lg:grid-cols-2");
    expect(container.innerHTML).not.toContain("min-w-[");
    expect(container.textContent).not.toContain("NaN");
  });
});
