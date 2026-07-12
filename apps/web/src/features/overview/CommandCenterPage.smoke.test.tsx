import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CommandCenterPage } from "./CommandCenterPage";

const arenaResponse = {
  data: {
    momentumFollower: {
      agentId: "momentum_follower",
      label: "Momentum Follower",
      positions: [],
      settledCount: 12,
      correctCount: 8,
      incorrectCount: 4,
      winRatePct: 66.67,
      netUnits: 5,
      roiPercent: 20,
      openPositions: 0,
    },
    contrarian: {
      agentId: "contrarian",
      label: "Contrarian",
      positions: [],
      settledCount: 8,
      correctCount: 3,
      incorrectCount: 5,
      winRatePct: 37.5,
      netUnits: -2,
      roiPercent: -10,
      openPositions: 0,
    },
    kellyCriterion: {
      agentId: "kelly_criterion",
      label: "Kelly Criterion",
      positions: [],
      settledCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      winRatePct: 0,
      netUnits: 0,
      roiPercent: 0,
      openPositions: 0,
    },
    rejections: [],
    proof: { type: "sha256", hash: "abc123def456", verifiableStat: null, note: "test" },
  },
};

const baseProps = {
  kpis: {
    liveFixtures: 4,
    feedFreshnessLabel: "updated 3s ago",
    signalsInWindow: 100,
    openSimulatedPositions: 3,
  },
  selectedFixtureLabel: "Norway vs England",
  chartData: [
    { name: "11:00 PM", home: 3.9, away: 2.1 },
    { name: "11:01 PM", home: 3.7, away: 2.2 },
  ],
  decisionFeed: [{ title: "Feed ingested", detail: "10 match record(s) normalized", time: "11:12 PM" }],
  latestSignal: {
    severityLabel: "HIGH",
    target: "Draw",
    priceMoveLabel: "39.54%",
  },
  systemHealthLabel: "Streams connected",
  isSystemHealthy: true,
};

describe("CommandCenterPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(arenaResponse),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders with representative mocked data given to it", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
    expect(screen.getByText("Live fixtures")).toBeInTheDocument();
    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(screen.getByText("39.54%")).toBeInTheDocument();
    expect(screen.getByText("Streams connected")).toBeInTheDocument();
  });

  it("shows an honest empty state instead of a fake chart when fewer than two points exist", () => {
    render(<CommandCenterPage {...baseProps} chartData={[]} />);
    expect(
      screen.getByText(/Fewer than two comparable odds points yet/)
    ).toBeInTheDocument();
  });

  it("shows an honest empty state instead of fabricating a latest signal", () => {
    render(<CommandCenterPage {...baseProps} latestSignal={null} />);
    expect(
      screen.getByText("No signal crossed the deterministic threshold in this window.")
    ).toBeInTheDocument();
  });

  it("shows an honest waiting state for Strategy Leader and Verification before arena data arrives", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<CommandCenterPage {...baseProps} />);
    expect(screen.getAllByText("Waiting for arena data.")).toHaveLength(2);
  });

  it("renders the real leading strategy and verification status once /api/arena resolves", async () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(await screen.findByText("Momentum Follower")).toBeInTheDocument();
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.getByText("12 settled")).toBeInTheDocument();
    expect(screen.getByText("No settled signal yet")).toBeInTheDocument();
    expect(screen.getByText(/Hash abc123def456/)).toBeInTheDocument();
  });

  it("does not throw when the arena fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
    expect(() => render(<CommandCenterPage {...baseProps} />)).not.toThrow();
    await waitFor(() => expect(screen.getAllByText("Waiting for arena data.")).toHaveLength(2));
  });
});
