import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ArenaPanel } from "./ArenaPanel";

const arenaResponse = {
  data: {
    momentumFollower: {
      agentId: "momentum_follower",
      label: "Momentum Follower",
      positions: [
        {
          agentId: "momentum_follower",
          signalId: "sig-1",
          matchId: "m1",
          match: "Norway vs England",
          side: "home",
          target: "Norway",
          oddsTaken: 1.85,
          stakeUnits: 1,
          resultStatus: "pending",
          profitUnits: 0,
        },
      ],
      settledCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      winRatePct: 0,
      netUnits: 0,
      roiPercent: 0,
      openPositions: 1,
    },
    contrarian: {
      agentId: "contrarian",
      label: "Contrarian",
      positions: [],
      settledCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      winRatePct: 0,
      netUnits: 0,
      roiPercent: 0,
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
  },
};

describe("ArenaPanel", () => {
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

  it("renders without throwing when the fetch fails", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
    expect(() => render(<ArenaPanel />)).not.toThrow();
  });

  it("calls onSelectSignalId with the position's signalId when a position row is clicked", async () => {
    const onSelectSignalId = vi.fn();
    render(<ArenaPanel onSelectSignalId={onSelectSignalId} />);

    const positionButton = await waitFor(() => screen.getByText(/Norway vs England/));
    fireEvent.click(positionButton.closest("button")!);

    expect(onSelectSignalId).toHaveBeenCalledWith("sig-1");
  });

  it("does not throw when a position is clicked and onSelectSignalId is omitted", async () => {
    render(<ArenaPanel />);
    const positionButton = await waitFor(() => screen.getByText(/Norway vs England/));
    expect(() => fireEvent.click(positionButton.closest("button")!)).not.toThrow();
  });
});
