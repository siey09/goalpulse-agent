import { beforeEach, describe, expect, it } from "vitest";
import { store, evaluatePendingSignalsForFinishedMatches } from "./store";
import type { AgentSignal, Match } from "./types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 90,
    status: "finished",
    ...overrides,
  } as Match;
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
  } as AgentSignal;
}

beforeEach(() => {
  store.matches = [];
  store.recentFinishedMatches = [];
  store.oddsSnapshots = [];
  store.signals = [];
  store.agentRuns = [];
});

describe("evaluatePendingSignalsForFinishedMatches — 1X2 market", () => {
  it("marks a home-side signal correct when the home team wins", () => {
    store.matches = [makeMatch({ homeScore: 2, awayScore: 0 })];
    store.signals = [makeSignal({ side: "home", target: "Team A" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });

  it("marks a home-side signal incorrect when the away team wins", () => {
    store.matches = [makeMatch({ homeScore: 0, awayScore: 2 })];
    store.signals = [makeSignal({ side: "home", target: "Team A" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("incorrect");
  });

  it("marks any 1X2 signal incorrect on a draw (neither side wins a moneyline bet)", () => {
    store.matches = [makeMatch({ homeScore: 1, awayScore: 1 })];
    store.signals = [
      makeSignal({ side: "home", target: "Team A" }),
      makeSignal({ id: "signal-2", side: "away", target: "Team B" }),
    ];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("incorrect");
    expect(store.signals[1].resultStatus).toBe("incorrect");
  });

  it("leaves the signal pending when the match has not finished yet", () => {
    store.matches = [makeMatch({ status: "live", homeScore: 1, awayScore: 0 })];
    store.signals = [makeSignal({ side: "home" })];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("pending");
  });
});

describe("evaluatePendingSignalsForFinishedMatches — Over/Under totals market", () => {
  it("marks an Over signal correct when combined goals exceed the line", () => {
    store.matches = [makeMatch({ homeScore: 2, awayScore: 2 })];
    store.signals = [
      makeSignal({
        matchId: "match-1-totals-3.5",
        target: "Over 3.5",
        side: "home",
      }),
    ];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });

  it("marks an Over signal incorrect when combined goals are below the line", () => {
    store.matches = [makeMatch({ homeScore: 1, awayScore: 0 })];
    store.signals = [
      makeSignal({
        matchId: "match-1-totals-3.5",
        target: "Over 3.5",
        side: "home",
      }),
    ];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("incorrect");
  });

  it("marks an Under signal correct when combined goals are below the line", () => {
    store.matches = [makeMatch({ homeScore: 1, awayScore: 0 })];
    store.signals = [
      makeSignal({
        matchId: "match-1-totals-3.5",
        target: "Under 3.5",
        side: "away",
      }),
    ];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });

  it("resolves the base fixture via the '-totals-<line>' matchId suffix", () => {
    store.matches = [makeMatch({ id: "18198205", homeScore: 3, awayScore: 1 })];
    store.signals = [
      makeSignal({
        matchId: "18198205-totals-2.5",
        target: "Over 2.5",
        side: "home",
      }),
    ];

    evaluatePendingSignalsForFinishedMatches();

    expect(store.signals[0].resultStatus).toBe("correct");
  });
});
