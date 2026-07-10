import { describe, expect, it } from "vitest";
import {
  buildContrarianPosition,
  buildKellyCriterionPosition,
  buildMomentumFollowerPosition,
  calculateKellyStake,
  computeArenaScoreboards,
  getRejectionReason,
  isMarketOnlyMove,
  isTotalsSignal,
} from "./arena";
import type { AgentSignal, Match, OddsSnapshot } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 90,
    status: "finished",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snapshot-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 1.5,
    awayOdds: 6.0,
    drawOdds: 4.0,
    homeScore: 0,
    awayScore: 0,
    minute: 80,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

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
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("isMarketOnlyMove", () => {
  it("is true when fieldPressureScore is below 22", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 8 } },
    });

    expect(isMarketOnlyMove(signal)).toBe(true);
  });

  it("is false when fieldPressureScore is 22 or above", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 22 } },
    });

    expect(isMarketOnlyMove(signal)).toBe(false);
  });

  it("is true when there is no scoresContext at all (defaults to 0)", () => {
    const signal = makeSignal({ evidence: undefined });

    expect(isMarketOnlyMove(signal)).toBe(true);
  });
});

describe("isTotalsSignal", () => {
  it("recognizes Over/Under targets", () => {
    expect(isTotalsSignal(makeSignal({ target: "Over 3.5" }))).toBe(true);
    expect(isTotalsSignal(makeSignal({ target: "Under 2.5" }))).toBe(true);
  });

  it("does not misclassify a normal team name", () => {
    expect(isTotalsSignal(makeSignal({ target: "Team A" }))).toBe(false);
  });
});

describe("buildMomentumFollowerPosition", () => {
  it("returns null for totals signals", () => {
    const signal = makeSignal({ target: "Over 3.5" });

    expect(buildMomentumFollowerPosition(signal)).toBeNull();
  });

  it("takes the signal's own side/target/odds verbatim and settles a win", () => {
    const signal = makeSignal({ resultStatus: "correct", oddsAfter: 1.5 });

    const position = buildMomentumFollowerPosition(signal);

    expect(position).not.toBeNull();
    expect(position?.side).toBe("home");
    expect(position?.target).toBe("Team A");
    expect(position?.oddsTaken).toBe(1.5);
    expect(position?.stakeUnits).toBe(1);
    // profit = 1 * (1.5 - 1) = 0.5
    expect(position?.profitUnits).toBe(0.5);
  });

  it("settles a flat -1 unit loss for an incorrect signal", () => {
    const signal = makeSignal({ resultStatus: "incorrect" });

    const position = buildMomentumFollowerPosition(signal);

    expect(position?.profitUnits).toBe(-1);
  });

  it("settles 0 profit for a pending signal", () => {
    const signal = makeSignal({ resultStatus: "pending" });

    const position = buildMomentumFollowerPosition(signal);

    expect(position?.profitUnits).toBe(0);
  });
});

describe("buildContrarianPosition", () => {
  it("returns null for totals signals", () => {
    const signal = makeSignal({
      target: "Over 3.5",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot();

    expect(buildContrarianPosition(signal, makeMatch(), snapshot)).toBeNull();
  });

  it("returns null when the move is field-backed, not market-only", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 45 } },
    });
    const snapshot = makeSnapshot();

    expect(buildContrarianPosition(signal, makeMatch(), snapshot)).toBeNull();
  });

  it("returns null when there is no original snapshot to read the opposite price from", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });

    expect(buildContrarianPosition(signal, makeMatch(), undefined)).toBeNull();
  });

  it("takes the opposite side and reads its real quoted price from the snapshot", () => {
    const signal = makeSignal({
      side: "home",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot({ homeOdds: 1.5, awayOdds: 6.0 });

    const position = buildContrarianPosition(signal, makeMatch({ status: "live" }), snapshot);

    expect(position?.side).toBe("away");
    expect(position?.target).toBe("Team B");
    expect(position?.oddsTaken).toBe(6.0);
    expect(position?.stakeUnits).toBe(1);
  });

  it("loses when the original signal's side won", () => {
    const signal = makeSignal({
      side: "home",
      resultStatus: "correct",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot();
    const match = makeMatch({ status: "finished", homeScore: 2, awayScore: 0 });

    const position = buildContrarianPosition(signal, match, snapshot);

    expect(position?.resultStatus).toBe("incorrect");
  });

  it("wins when the opposite side actually won", () => {
    const signal = makeSignal({
      side: "home",
      resultStatus: "incorrect",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot();
    const match = makeMatch({ status: "finished", homeScore: 0, awayScore: 2 });

    const position = buildContrarianPosition(signal, match, snapshot);

    expect(position?.resultStatus).toBe("correct");
  });

  it("also loses when the match was a draw (neither side won)", () => {
    const signal = makeSignal({
      side: "home",
      resultStatus: "incorrect",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot();
    const match = makeMatch({ status: "finished", homeScore: 1, awayScore: 1 });

    const position = buildContrarianPosition(signal, match, snapshot);

    expect(position?.resultStatus).toBe("incorrect");
  });

  it("stays pending until the match is finished", () => {
    const signal = makeSignal({
      side: "home",
      resultStatus: "pending",
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 0 } },
    });
    const snapshot = makeSnapshot();
    const match = makeMatch({ status: "live" });

    const position = buildContrarianPosition(signal, match, snapshot);

    expect(position?.resultStatus).toBe("pending");
  });
});

describe("getRejectionReason", () => {
  it("returns a totals_signal rejection for any agent when the signal is a totals signal", () => {
    const signal = makeSignal({ target: "Over 2.5" });

    const result = getRejectionReason("momentum_follower", signal, undefined);

    expect(result).toEqual({
      agentId: "momentum_follower",
      signalId: "signal-1",
      matchId: "match-1",
      reason: "totals_signal",
      reasonText: "Totals signal — Arena only trades 1X2 markets.",
    });
  });

  it("returns null for momentum_follower on a tradeable 1X2 signal", () => {
    const signal = makeSignal();

    expect(getRejectionReason("momentum_follower", signal, undefined)).toBeNull();
  });

  it("returns null for kelly_criterion on a tradeable 1X2 signal", () => {
    const signal = makeSignal();

    expect(getRejectionReason("kelly_criterion", signal, undefined)).toBeNull();
  });

  it("returns a not_market_only_move rejection for contrarian when fieldPressureScore is >= 22", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 45 } },
    });

    const result = getRejectionReason("contrarian", signal, makeSnapshot());

    expect(result?.reason).toBe("not_market_only_move");
  });

  it("returns a no_original_snapshot rejection for contrarian on a market-only move with no snapshot", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 5 } },
    });

    const result = getRejectionReason("contrarian", signal, undefined);

    expect(result?.reason).toBe("no_original_snapshot");
  });

  it("returns null for contrarian on a tradeable market-only move with a snapshot", () => {
    const signal = makeSignal({
      evidence: { source: "txline", scoresContext: { fieldPressureScore: 5 } },
    });

    expect(getRejectionReason("contrarian", signal, makeSnapshot())).toBeNull();
  });
});

describe("computeArenaScoreboards", () => {
  it("aggregates net units, ROI, and win rate across multiple signals", () => {
    const matchesById = new Map([
      ["match-1", makeMatch({ status: "finished", homeScore: 2, awayScore: 0 })],
    ]);
    const snapshot = makeSnapshot();
    const snapshotsById = new Map([["snapshot-1", snapshot]]);

    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-1",
        side: "home",
        resultStatus: "correct",
        oddsAfter: 1.5,
        evidence: {
          source: "txline",
          currentSnapshotId: "snapshot-1",
          scoresContext: { fieldPressureScore: 0 },
        },
      }),
      makeSignal({
        id: "signal-2",
        side: "home",
        resultStatus: "correct",
        oddsAfter: 2.0,
        evidence: {
          source: "txline",
          currentSnapshotId: "snapshot-1",
          scoresContext: { fieldPressureScore: 45 },
        },
      }),
    ];

    const { momentumFollower, contrarian, kellyCriterion } = computeArenaScoreboards(
      signals,
      matchesById,
      snapshotsById
    );

    // Momentum Follower took both signals at face value, both correct:
    // (1.5-1) + (2.0-1) = 1.5 net units over 2 settled bets -> 75% ROI
    expect(momentumFollower.settledCount).toBe(2);
    expect(momentumFollower.netUnits).toBe(1.5);
    expect(momentumFollower.roiPercent).toBe(75);
    expect(momentumFollower.winRatePct).toBe(100);

    // Contrarian only acted on signal-1 (market-only move, fieldPressureScore 0);
    // signal-2 was field-backed (45) so Contrarian sat it out. Contrarian faded
    // signal-1 (bet away), but home actually won 2-0, so Contrarian lost that bet.
    expect(contrarian.settledCount).toBe(1);
    expect(contrarian.netUnits).toBe(-1);
    expect(contrarian.winRatePct).toBe(0);

    // Kelly: neither signal in this fixture sets confidenceScore, so both
    // are treated as zero edge and stake nothing - regression check that
    // a real pre-item-7 signal shape doesn't crash Kelly, it just sits out.
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.netUnits).toBe(0);
    expect(kellyCriterion.roiPercent).toBe(0);
  });

  it("collects a rejection per agent that sat out a signal, with the correct reason", () => {
    const matchesById = new Map([
      ["match-1", makeMatch({ status: "finished", homeScore: 2, awayScore: 0 })],
    ]);
    const snapshot = makeSnapshot();
    const snapshotsById = new Map([["snapshot-1", snapshot]]);

    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-field-backed",
        resultStatus: "correct",
        oddsAfter: 2.0,
        evidence: {
          source: "txline",
          currentSnapshotId: "snapshot-1",
          scoresContext: { fieldPressureScore: 45 },
        },
      }),
      makeSignal({ id: "signal-totals", target: "Over 2.5", resultStatus: "correct" }),
    ];

    const { rejections } = computeArenaScoreboards(signals, matchesById, snapshotsById);

    const contrarianRejection = rejections.find(
      (r) => r.agentId === "contrarian" && r.signalId === "signal-field-backed"
    );
    expect(contrarianRejection?.reason).toBe("not_market_only_move");

    const totalsRejections = rejections.filter((r) => r.signalId === "signal-totals");
    expect(totalsRejections).toHaveLength(3);
    expect(totalsRejections.map((r) => r.agentId).sort()).toEqual([
      "contrarian",
      "kelly_criterion",
      "momentum_follower",
    ]);
  });

  it("computes Kelly's variable stakes correctly across multiple signals", () => {
    const signals: AgentSignal[] = [
      makeSignal({
        id: "signal-a",
        resultStatus: "correct",
        oddsAfter: 2.0,
        confidenceScore: 100,
      }),
      makeSignal({
        id: "signal-b",
        resultStatus: "incorrect",
        oddsAfter: 2.0,
        confidenceScore: 50,
      }),
    ];

    const { kellyCriterion } = computeArenaScoreboards(
      signals,
      new Map(),
      new Map()
    );

    expect(kellyCriterion.positions[0].stakeUnits).toBe(2.0);
    expect(kellyCriterion.positions[1].stakeUnits).toBe(1.5);
    expect(kellyCriterion.settledCount).toBe(2);
    expect(kellyCriterion.correctCount).toBe(1);
    expect(kellyCriterion.incorrectCount).toBe(1);
    // netUnits = 2.0 + (-1.5) = 0.5; totalStaked = 2.0 + 1.5 = 3.5
    // roiPercent = round((0.5 / 3.5) * 100) = 14.29
    expect(kellyCriterion.netUnits).toBe(0.5);
    expect(kellyCriterion.roiPercent).toBe(14.29);
    expect(kellyCriterion.winRatePct).toBe(50);
  });
});

describe("calculateKellyStake", () => {
  it("stakes exactly 0 when confidenceScore is 0, regardless of odds", () => {
    // Zero assumed edge means our probability estimate equals the market's
    // own implied probability exactly, which algebraically zeroes the
    // Kelly fraction for any odds value - not a coincidence of one
    // particular odds price.
    expect(calculateKellyStake(3.0, 0)).toBe(0);
  });

  it("computes an uncapped stake for a mid-range confidence", () => {
    // odds=2.0: marketImpliedProb=0.5, edgeFraction=0.5*0.15=0.075,
    // ourProbEstimate=0.575, b=1.0, q=0.425.
    // kellyFraction = (1*0.575 - 0.425) / 1 = 0.15 (below the 0.2 cap).
    // stake = 0.15 * 10 = 1.5.
    expect(calculateKellyStake(2.0, 50)).toBe(1.5);
  });

  it("caps the stake at MAX_STAKE_FRACTION for a high-confidence, short-odds signal", () => {
    // odds=2.0, confidenceScore=100: ourProbEstimate=0.65, b=1.0, q=0.35.
    // kellyFraction raw = (0.65-0.35)/1 = 0.30, capped at 0.2.
    // stake = 0.2 * 10 = 2.0.
    expect(calculateKellyStake(2.0, 100)).toBe(2.0);
  });

  it("stakes 0 for odds at or below 1, avoiding division by zero", () => {
    expect(calculateKellyStake(1.0, 100)).toBe(0);
  });
});

describe("buildKellyCriterionPosition", () => {
  it("returns null for totals signals", () => {
    const signal = makeSignal({ target: "Over 3.5", confidenceScore: 100 });

    expect(buildKellyCriterionPosition(signal)).toBeNull();
  });

  it("takes the signal's own side/target/odds, sized by confidenceScore", () => {
    const signal = makeSignal({
      side: "home",
      target: "Team A",
      oddsAfter: 2.0,
      confidenceScore: 100,
      resultStatus: "correct",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position).not.toBeNull();
    expect(position?.side).toBe("home");
    expect(position?.target).toBe("Team A");
    expect(position?.oddsTaken).toBe(2.0);
    expect(position?.stakeUnits).toBe(2.0);
    // profit = 2.0 * (2.0 - 1) = 2.0
    expect(position?.profitUnits).toBe(2.0);
  });

  it("settles a loss proportional to the computed stake for an incorrect signal", () => {
    const signal = makeSignal({
      oddsAfter: 2.0,
      confidenceScore: 100,
      resultStatus: "incorrect",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(2.0);
    expect(position?.profitUnits).toBe(-2.0);
  });

  it("settles 0 profit for a pending signal", () => {
    const signal = makeSignal({ confidenceScore: 100, resultStatus: "pending" });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.profitUnits).toBe(0);
  });

  it("treats a missing confidenceScore as zero edge, staking nothing", () => {
    const signal = makeSignal({ confidenceScore: undefined, resultStatus: "pending" });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(0);
    expect(position?.profitUnits).toBe(0);
  });

  it("settles a zero-stake incorrect position to +0, not -0", () => {
    const signal = makeSignal({
      oddsAfter: 2.0,
      confidenceScore: 0,
      resultStatus: "incorrect",
    });

    const position = buildKellyCriterionPosition(signal);

    expect(position?.stakeUnits).toBe(0);
    expect(position?.profitUnits).toBe(0);
  });
});
