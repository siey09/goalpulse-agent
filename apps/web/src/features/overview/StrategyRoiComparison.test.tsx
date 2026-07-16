import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArenaResponse } from "../../lib/arena";
import { StrategyRoiComparison } from "./StrategyRoiComparison";

const arena: ArenaResponse = {
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
    openPositions: 1,
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
  proof: { type: "sha256", hash: "abc123", verifiableStat: null, note: "test" },
};

describe("StrategyRoiComparison", () => {
  it("renders positive and negative ROI on opposite sides of zero", () => {
    render(<StrategyRoiComparison arena={arena} isUnavailable={false} />);

    expect(screen.getByRole("region", { name: "Strategy ROI comparison" })).toBeInTheDocument();
    expect(screen.getByTestId("roi-bar-momentum_follower")).toHaveAttribute("data-direction", "positive");
    expect(screen.getByTestId("roi-bar-contrarian")).toHaveAttribute("data-direction", "negative");
    expect(screen.getByTestId("roi-bar-kelly_criterion")).toHaveAttribute("data-direction", "neutral");
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.getByText("-10%")).toBeInTheDocument();
    expect(screen.getByText(/Momentum Follower currently leads/)).toBeInTheDocument();
    expect(screen.getByText("12 settled · 1 open")).toBeInTheDocument();
  });

  it("does not crown a winner below the existing sample threshold", () => {
    const lowSampleArena: ArenaResponse = {
      ...arena,
      momentumFollower: { ...arena.momentumFollower, settledCount: 1 },
      contrarian: { ...arena.contrarian, settledCount: 1 },
    };

    render(<StrategyRoiComparison arena={lowSampleArena} isUnavailable={false} />);

    expect(
      screen.getByText("Not enough settled positions yet to recommend a leading strategy.")
    ).toBeInTheDocument();
  });

  it("distinguishes waiting from unavailable arena data", () => {
    const { rerender } = render(<StrategyRoiComparison arena={null} isUnavailable={false} />);
    expect(screen.getByText("Waiting for arena data.")).toBeInTheDocument();

    rerender(<StrategyRoiComparison arena={null} isUnavailable />);
    expect(screen.getByText("Arena data unavailable.")).toBeInTheDocument();
  });
});
