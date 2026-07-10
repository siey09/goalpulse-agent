import { beforeEach, describe, expect, it } from "vitest";
import {
  store,
  evaluatePendingSignalsForFinishedMatches,
  mergeOddsSnapshots,
  upsertRecentFinishedMatches,
} from "./store";
import type { AgentSignal, Match, OddsSnapshot } from "./types";

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

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.5,
    drawOdds: 3.2,
    homeScore: 0,
    awayScore: 0,
    minute: 1,
    source: "txline",
    createdAt: "2026-07-10T07:47:00.000Z",
    ...overrides,
  } as OddsSnapshot;
}

beforeEach(() => {
  store.matches = [];
  store.recentFinishedMatches = [];
  store.oddsSnapshots = [];
  store.signals = [];
  store.agentRuns = [];
});

describe("upsertRecentFinishedMatches", () => {
  it("returns a match not previously seen as finished", () => {
    const match = makeMatch({ id: "match-1", status: "finished" });

    const result = upsertRecentFinishedMatches([match]);

    expect(result).toEqual([match]);
  });

  it("does not re-return a match already recorded as finished on a later call", () => {
    const match = makeMatch({ id: "match-1", status: "finished" });
    upsertRecentFinishedMatches([match]);

    const result = upsertRecentFinishedMatches([match]);

    expect(result).toEqual([]);
  });

  it("excludes a still-live match from the return value", () => {
    const liveMatch = makeMatch({ id: "match-2", status: "live" });

    const result = upsertRecentFinishedMatches([liveMatch]);

    expect(result).toEqual([]);
    expect(store.recentFinishedMatches).toEqual([]);
  });

  it("returns only the genuinely newly-finished matches from a mixed batch", () => {
    const alreadyFinished = makeMatch({ id: "match-1", status: "finished" });
    upsertRecentFinishedMatches([alreadyFinished]);

    const stillLive = makeMatch({ id: "match-2", status: "live" });
    const newlyFinished = makeMatch({ id: "match-3", status: "finished" });

    const result = upsertRecentFinishedMatches([alreadyFinished, stillLive, newlyFinished]);

    expect(result).toEqual([newlyFinished]);
  });

  it("still upserts the finished match into store.recentFinishedMatches as before", () => {
    const match = makeMatch({ id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });

    upsertRecentFinishedMatches([match]);

    expect(store.recentFinishedMatches).toEqual([match]);
  });
});

describe("mergeOddsSnapshots", () => {
  it("keeps store.oddsSnapshots sorted newest-first after merging backfilled snapshots", () => {
    // Simulates the live agent loop's invariant (agent.ts unshifts new
    // snapshots), i.e. the array starts newest-first.
    store.oddsSnapshots = [
      makeSnapshot({ id: "live-3", createdAt: "2026-07-10T07:48:00.000Z" }),
      makeSnapshot({ id: "live-2", createdAt: "2026-07-10T07:47:30.000Z" }),
      makeSnapshot({ id: "live-1", createdAt: "2026-07-10T07:47:00.000Z" }),
    ];

    // Recent-results backfill fetches finished-match history that can
    // interleave anywhere in time relative to what's already stored.
    mergeOddsSnapshots([
      makeSnapshot({ id: "backfill-2", createdAt: "2026-07-10T07:47:45.000Z" }),
      makeSnapshot({ id: "backfill-1", createdAt: "2026-07-10T07:46:00.000Z" }),
    ]);

    const timestamps = store.oddsSnapshots.map((s) => new Date(s.createdAt).getTime());
    const sortedDescending = [...timestamps].sort((a, b) => b - a);

    expect(timestamps).toEqual(sortedDescending);
  });

  it("does not duplicate a snapshot that already exists by id", () => {
    store.oddsSnapshots = [makeSnapshot({ id: "existing" })];

    mergeOddsSnapshots([makeSnapshot({ id: "existing" })]);

    expect(store.oddsSnapshots).toHaveLength(1);
  });
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
