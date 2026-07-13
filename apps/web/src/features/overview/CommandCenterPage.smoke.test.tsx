import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    matchLabel: "Norway vs England",
    confidenceLabel: "82%",
    evidenceLabel: "Field-backed",
    explanation: "Odds compression followed a high-danger possession sequence.",
  },
  systemHealthLabel: "Streams connected",
  isSystemHealthy: true,
  onNavigate: vi.fn(),
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders with representative mocked data given to it", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getAllByText("Norway vs England")).toHaveLength(2);
    expect(screen.getByText("Live fixtures")).toBeInTheDocument();
    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(screen.getByText("39.54%")).toBeInTheDocument();
    expect(screen.getAllByText("Streams connected")).toHaveLength(2);
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Why it matters")).not.toBeInTheDocument();
    expect(screen.getByText("Field-backed")).toBeInTheDocument();
    const rationale = screen.getByTitle(baseProps.latestSignal.explanation);
    expect(rationale).toHaveClass("line-clamp-2");
    expect(rationale).toHaveAttribute("title", baseProps.latestSignal.explanation);
    expect(rationale).toHaveTextContent(baseProps.latestSignal.explanation);
    expect(rationale).not.toHaveTextContent("Draw compressed 39.54%");
    expect(screen.getByRole("button", { name: "Inspect signal" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open verification" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Priority signal rail" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Live status" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Market workspace" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Decision activity" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trust evidence" })).toBeInTheDocument();
    expect(screen.getByTestId("command-workbench")).toHaveAttribute("data-layout", "signal-rail");
  });

  it("keeps tablet signal and live-status layouts to two rows until the large breakpoint", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByTestId("priority-signal-grid")).toHaveClass(
      "md:grid-cols-2",
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]"
    );
    expect(screen.getByTestId("priority-signal-actions")).toHaveClass(
      "md:col-span-2",
      "lg:col-span-1"
    );
    expect(screen.getByTestId("live-status-grid")).toHaveClass("md:grid-cols-3", "lg:grid-cols-5");
  });

  it("exposes the market evidence chart and every point as semantic content", () => {
    render(<CommandCenterPage {...baseProps} />);

    const chart = screen.getByRole("img", { name: "Market odds movement for Norway vs England" });
    expect(chart).toHaveAccessibleDescription("Home and away odds by timestamp. Exact values follow in the data table.");

    const table = screen.getByRole("table", { name: "Market odds data for Norway vs England" });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Timestamp" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Home odds" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Away odds" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "11:00 PM" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3.90" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2.10" })).toBeInTheDocument();
  });

  it("routes the operator from the priority signal to evidence and verification", () => {
    const onNavigate = vi.fn();
    render(<CommandCenterPage {...baseProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect signal" }));
    fireEvent.click(screen.getByRole("button", { name: "Open verification" }));
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "signals");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "verification");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "archive");
  });

  it.each([
    [true, "Compare live market context", "live-markets"],
    [false, "Resolve degraded stream state", "system-health"],
  ] as const)("routes the contextual system action from Live status", (isSystemHealthy, label, destination) => {
    const onNavigate = vi.fn();
    render(
      <CommandCenterPage
        {...baseProps}
        isSystemHealthy={isSystemHealthy}
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(onNavigate).toHaveBeenCalledWith(destination);
    expect(screen.queryByText("Operator brief")).not.toBeInTheDocument();
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

  it("shows an honest unavailable state when the arena fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
    render(<CommandCenterPage {...baseProps} />);
    await waitFor(() => expect(screen.getAllByText("Arena data unavailable.")).toHaveLength(2));
  });

  it("treats a non-success arena response as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve(arenaResponse),
      })
    );

    render(<CommandCenterPage {...baseProps} />);

    await waitFor(() => expect(screen.getAllByText("Arena data unavailable.")).toHaveLength(2));
    expect(screen.queryByText("Momentum Follower")).not.toBeInTheDocument();
    expect(screen.queryByText("+20%")).not.toBeInTheDocument();
  });

  it("clears stale arena proof and ROI when the next poll fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(arenaResponse),
      })
      .mockRejectedValueOnce(new Error("arena poll failed"));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommandCenterPage {...baseProps} />);
    await act(async () => {});

    expect(screen.getByText("Momentum Follower")).toBeInTheDocument();
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.getByText(/Hash abc123def456/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Arena data unavailable.")).toHaveLength(2);
    expect(screen.queryByText("Momentum Follower")).not.toBeInTheDocument();
    expect(screen.queryByText("+20%")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hash abc123def456/)).not.toBeInTheDocument();
  });
});
