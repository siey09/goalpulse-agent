import { describe, expect, it } from "vitest";
import {
  buildContrarianPosition,
  buildMomentumFollowerPosition,
  computeArenaScoreboards,
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

    const { momentumFollower, contrarian } = computeArenaScoreboards(
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
  });
});
