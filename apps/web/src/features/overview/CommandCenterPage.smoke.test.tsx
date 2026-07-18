import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CommandCenterPage } from "./CommandCenterPage";
import commandCenterSource from "./CommandCenterPage.tsx?raw";

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
  fixturePipeline: { live: 4, upcoming: 1, finished: 6 },
  signalOutcomes: { confirmed: 25, rejected: 54, pending: 42, strategyAccuracy: 31.6 },
  pnl: { netUnits: 4.25, roiPercent: 9.2, openPositions: 3, openExposure: 3, settledBets: 79 },
  archiveStatus: { pending: 0, failures: 0 },
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

  it("renders the dense operational overview from representative real data", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
    expect(screen.getByText("Live fixtures")).toBeInTheDocument();
    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(screen.getByText("39.54%")).toBeInTheDocument();
    expect(screen.getAllByText("Streams connected")).toHaveLength(2);
    expect(screen.getByText("Field-backed")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Priority signal rail" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Live status" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Decision activity" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Fixture pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signal outcomes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Strategy ROI comparison" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Risk and P&L" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trust evidence" })).toBeInTheDocument();
    expect(screen.getByTestId("command-workbench")).toHaveAttribute("data-layout", "operational-overview");
  });

  it("keeps tablet status layouts compact and stacks the workbench before desktop", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByTestId("priority-signal-grid")).toHaveClass(
      "md:grid-cols-2",
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]"
    );
    expect(screen.getByTestId("live-status-grid")).toHaveClass("md:grid-cols-3", "lg:grid-cols-5");
    expect(screen.getByTestId("command-workbench")).toHaveClass("lg:grid-cols-12");
    expect(screen.getByTestId("command-insight-grid")).toHaveClass("xl:grid-cols-12");
  });

  it("shows real fixture and signal compositions without the duplicate odds chart", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByText("Live").closest("li")).toHaveTextContent("4");
    expect(screen.getByText("Upcoming").closest("li")).toHaveTextContent("1");
    expect(screen.getByText("Finished").closest("li")).toHaveTextContent("6");
    expect(screen.getByText("Confirmed").closest("li")).toHaveTextContent("25");
    expect(screen.getByText("Rejected").closest("li")).toHaveTextContent("54");
    expect(screen.getByText("Pending").closest("li")).toHaveTextContent("42");
    expect(screen.getByText("31.6% reported accuracy")).toBeInTheDocument();
    expect(screen.queryByText("Market Pulse")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Market odds movement/ })).not.toBeInTheDocument();
    expect(commandCenterSource).not.toMatch(/from "recharts"/);
  });

  it("routes every overview drill-down to its dedicated workspace", () => {
    const onNavigate = vi.fn();
    render(<CommandCenterPage {...baseProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect signal" }));
    fireEvent.click(screen.getByRole("button", { name: "Open verification" }));
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Live Markets" }));
    fireEvent.click(screen.getByRole("button", { name: "Review system health" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "signals");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "verification");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "archive");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "live-markets");
    expect(onNavigate).toHaveBeenNthCalledWith(5, "system-health");
  });

  it.each([
    [true, "Compare live market context", "live-markets"],
    [false, "Resolve degraded stream state", "system-health"],
  ] as const)("routes the contextual system action from Live status", (isSystemHealthy, label, destination) => {
    const onNavigate = vi.fn();
    render(<CommandCenterPage {...baseProps} isSystemHealthy={isSystemHealthy} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onNavigate).toHaveBeenCalledWith(destination);
  });

  it("distinguishes real zeroes from unavailable stats and P&L", () => {
    const { rerender } = render(
      <CommandCenterPage
        {...baseProps}
        signalOutcomes={{ confirmed: 0, rejected: 0, pending: 0, strategyAccuracy: 0 }}
        pnl={{ netUnits: 0, roiPercent: 0, openPositions: 0, openExposure: 0, settledBets: 0 }}
      />
    );

    expect(screen.getByText("No signals have entered the audit yet.")).toBeInTheDocument();
    expect(screen.queryByText(/reported accuracy/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");

    rerender(<CommandCenterPage {...baseProps} signalOutcomes={null} pnl={null} archiveStatus={null} />);
    expect(screen.getByText("Signal audit data unavailable.")).toBeInTheDocument();
    expect(screen.getByText("P&L data unavailable.")).toBeInTheDocument();
    expect(screen.getByText("Archive status unavailable.")).toBeInTheDocument();
  });

  it("does not fabricate a latest signal", () => {
    render(<CommandCenterPage {...baseProps} latestSignal={null} />);
    expect(screen.getByText("No signal crossed the deterministic threshold in this window.")).toBeInTheDocument();
  });

  it("shows honest waiting state before arena data arrives", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<CommandCenterPage {...baseProps} />);
    expect(screen.getAllByText("Waiting for arena data.")).toHaveLength(2);
  });

  it("renders strategy evidence and verification status once arena resolves", async () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(await screen.findByText("Momentum Follower")).toBeInTheDocument();
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.getByText("12 settled · 0 open")).toBeInTheDocument();
    expect(screen.getByText("No live-match signal yet")).toBeInTheDocument();
    expect(screen.getByText(/Hash abc123def456/)).toBeInTheDocument();
  });

  it("isolates arena fetch failure and clears stale strategy proof", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(arenaResponse) })
      .mockRejectedValueOnce(new Error("arena poll failed"));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommandCenterPage {...baseProps} />);
    await act(async () => {});
    expect(screen.getByText("Momentum Follower")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Arena data unavailable.")).toHaveLength(2);
    expect(screen.queryByText("Momentum Follower")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hash abc123def456/)).not.toBeInTheDocument();
  });
});
