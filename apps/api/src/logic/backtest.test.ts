import { describe, expect, it } from "vitest";
import { computeBacktestScoreboards } from "./backtest";
import type { AgentSignal } from "../types";

function makeSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 2.0,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("computeBacktestScoreboards", () => {
  it("returns empty scoreboards for no archived signals", () => {
    const { momentumFollower, kellyCriterion } = computeBacktestScoreboards([]);

    expect(momentumFollower.settledCount).toBe(0);
    expect(kellyCriterion.settledCount).toBe(0);
  });

  it("aggregates Momentum Follower and Kelly Criterion across archived signals, excluding totals", () => {
    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-1",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
      makeSignal({
        id: "signal-2",
        resultStatus: "incorrect",
        oddsAfter: 1.5,
        confidenceScore: 20,
      }),
      makeSignal({
        id: "signal-3",
        target: "Over 3.5",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
    ];

    const { momentumFollower, kellyCriterion } = computeBacktestScoreboards(signals);

    // Momentum Follower (flat 1-unit stakes): (2.0-1) + (-1) = 0 net units
    // over 2 settled bets (totals signal-3 excluded) -> 0% ROI, 50% win rate.
    expect(momentumFollower.settledCount).toBe(2);
    expect(momentumFollower.netUnits).toBe(0);
    expect(momentumFollower.roiPercent).toBe(0);
    expect(momentumFollower.winRatePct).toBe(50);

    // Kelly Criterion: signal-1 (odds=2.0, confidence=100) stakes 2.0,
    // wins 2.0. signal-2 (odds=1.5, confidence=20) stakes 0.9, loses 0.9.
    // netUnits = 2.0 + (-0.9) = 1.1; totalStaked = 2.0 + 0.9 = 2.9;
    // roiPercent = round((1.1 / 2.9) * 100) = 37.93.
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.positions[0].stakeUnits).toBe(2.0);
    expect(kellyCriterion.positions[1].stakeUnits).toBe(0.9);
    expect(kellyCriterion.netUnits).toBe(1.1);
    expect(kellyCriterion.roiPercent).toBe(37.93);
    expect(kellyCriterion.winRatePct).toBe(50);
  });

  it("treats a missing confidenceScore as zero edge without crashing Kelly's backtest", () => {
    const signals: AgentSignal[] = [
      makeSignal({ confidenceScore: undefined, resultStatus: "pending" }),
    ];

    const { kellyCriterion } = computeBacktestScoreboards(signals);

    expect(kellyCriterion.positions[0].stakeUnits).toBe(0);
    expect(kellyCriterion.positions[0].profitUnits).toBe(0);
  });
});
