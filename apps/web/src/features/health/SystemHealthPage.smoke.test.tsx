import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SystemHealthPage } from "./SystemHealthPage";
import type { FeedHealth, Health } from "../../types";

const health: Health = {
  ok: true,
  useSimulatedFeed: false,
  liveStream: { connected: true, totalEventsReceived: 3248, totalReconnects: 1, lastError: null },
};

const healthyFeedHealth: FeedHealth = {
  status: "healthy",
  cycleHealth: {
    lastRunAt: new Date().toISOString(),
    cycleGapMs: 2000,
    expectedIntervalMs: 3000,
    isCurrentGapExceeded: false,
    recentMissedCycles: 0,
  },
  oddsFreshness: { staleThresholdMs: 300000, staleLiveMatchCount: 0, staleLiveMatches: [] },
  fixtureCoverage: {
    lastRunRawFixtureCount: 14,
    lastRunProcessedCount: 14,
    isCoverageDropped: false,
    recentCoverageDrops: 0,
  },
};

describe("SystemHealthPage", () => {
  it("shows a waiting state before the first health check completes", () => {
    render(<SystemHealthPage health={null} feedHealth={null} />);
    expect(screen.getByText("Waiting for the first health check to complete.")).toBeInTheDocument();
  });

  it("shows basic connectivity and an explicit unavailable reason when feed health hasn't loaded yet", () => {
    render(<SystemHealthPage health={health} feedHealth={null} />);
    // Existing liveStream information must still render even without feedHealth.
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/3248 events received/)).toBeInTheDocument();
    expect(
      screen.getByText(/Feed-health metrics .* are not available yet/)
    ).toBeInTheDocument();
  });

  it("renders a healthy status with real cycle/odds/coverage figures", () => {
    render(<SystemHealthPage health={health} feedHealth={healthyFeedHealth} />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("No stale live matches.")).toBeInTheDocument();
    expect(screen.getByText("The most recent run processed every fixture TxLINE reported.")).toBeInTheDocument();
  });

  it("renders a degraded status", () => {
    render(
      <SystemHealthPage
        health={health}
        feedHealth={{ ...healthyFeedHealth, status: "degraded" }}
      />
    );
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("renders a down status", () => {
    render(<SystemHealthPage health={health} feedHealth={{ ...healthyFeedHealth, status: "down" }} />);
    expect(screen.getByText("Down")).toBeInTheDocument();
  });

  it("lists stale live matches with a duration when present", () => {
    render(
      <SystemHealthPage
        health={health}
        feedHealth={{
          ...healthyFeedHealth,
          oddsFreshness: {
            staleThresholdMs: 300000,
            staleLiveMatchCount: 1,
            staleLiveMatches: [{ matchId: "m1", match: "Argentina vs Switzerland", lastOddsAt: new Date().toISOString(), staleForMs: 365000 }],
          },
        }}
      />
    );
    expect(screen.getByText(/Argentina vs Switzerland — stale for 6m/)).toBeInTheDocument();
  });

  it("flags a fixture-coverage drop", () => {
    render(
      <SystemHealthPage
        health={health}
        feedHealth={{
          ...healthyFeedHealth,
          fixtureCoverage: {
            lastRunRawFixtureCount: 14,
            lastRunProcessedCount: 11,
            isCoverageDropped: true,
            recentCoverageDrops: 2,
          },
        }}
      />
    );
    expect(
      screen.getByText("The most recent run processed fewer fixtures than TxLINE reported.")
    ).toBeInTheDocument();
  });

  it("keeps the threshold glossary's guide-target text intact", () => {
    render(<SystemHealthPage health={health} feedHealth={healthyFeedHealth} />);
    expect(screen.getByText("Signal Thresholds")).toBeInTheDocument();
  });

  it("uses a responsive grid class rather than a fixed desktop-only column count", () => {
    const { container } = render(<SystemHealthPage health={health} feedHealth={healthyFeedHealth} />);
    const grid = container.querySelector(".grid-cols-1.md\\:grid-cols-2");
    expect(grid).not.toBeNull();
  });
});
