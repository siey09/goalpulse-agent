import { describe, expect, it } from "vitest";
import { assessBandBreach, summarizeBandBreaches } from "./marketConfirmation";
import type { BandBreachResult } from "./marketConfirmation";
import type { AgentSignal, Match, OddsSnapshot } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "live",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-prev",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.0,
    drawOdds: 3.25,
    homeScore: 0,
    awayScore: 0,
    minute: 40,
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
    oddsAfter: 1.9,
    oddsChangePct: 5,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

function makeResult(overrides: Partial<BandBreachResult> = {}): BandBreachResult {
  return {
    signalId: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    side: "home",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.9,
    previousBandBid: 1.98,
    previousBandAsk: 2.02,
    bandBreached: false,
    ...overrides,
  };
}

describe("assessBandBreach", () => {
  it("flags a band breach when the home side's current odds fall below the previous quote's bid", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ homeOdds: 2.0 });
    const signal = makeSignal({ side: "home", oddsAfter: 1.9 });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(true);
    expect(result.previousBandBid).toBe(1.98);
    expect(result.previousBandAsk).toBe(2.02);
  });

  it("does not flag a breach when the current odds stay within the previous quote's band", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ homeOdds: 2.0 });
    const signal = makeSignal({ side: "home", oddsAfter: 1.99 });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(false);
  });

  it("checks the away side's band when the signal side is away", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot({ awayOdds: 3.0 });
    const signal = makeSignal({ side: "away", oddsAfter: 2.9, target: "Team B" });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.bandBreached).toBe(true);
    expect(result.previousBandBid).toBe(2.97);
    expect(result.previousBandAsk).toBe(3.03);
  });

  it("carries through the signal's own identifying fields", () => {
    const match = makeMatch();
    const previousSnapshot = makeSnapshot();
    const signal = makeSignal({
      id: "signal-42",
      matchId: "match-9",
      match: "X vs Y",
      side: "home",
      severity: "MEDIUM",
      oddsBefore: 2.5,
      oddsAfter: 2.0,
    });

    const result = assessBandBreach(signal, match, previousSnapshot);

    expect(result.signalId).toBe("signal-42");
    expect(result.matchId).toBe("match-9");
    expect(result.match).toBe("X vs Y");
    expect(result.severity).toBe("MEDIUM");
    expect(result.oddsBefore).toBe(2.5);
    expect(result.oddsAfter).toBe(2.0);
  });
});

describe("summarizeBandBreaches", () => {
  it("returns zero counts and 0% rate for an empty list", () => {
    expect(summarizeBandBreaches([])).toEqual({
      totalChecked: 0,
      confirmedCount: 0,
      unconfirmedCount: 0,
      confirmationRatePct: 0,
    });
  });

  it("counts confirmed vs unconfirmed and computes the rate", () => {
    const results = [
      makeResult({ bandBreached: true }),
      makeResult({ bandBreached: true }),
      makeResult({ bandBreached: false }),
      makeResult({ bandBreached: false }),
    ];

    expect(summarizeBandBreaches(results)).toEqual({
      totalChecked: 4,
      confirmedCount: 2,
      unconfirmedCount: 2,
      confirmationRatePct: 50,
    });
  });
});
