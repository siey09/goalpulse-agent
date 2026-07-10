import { describe, expect, it } from "vitest";
import { findSimilarSignals } from "./historicalPatternMatch";
import type { AgentSignal, ArchiveEntry } from "../types";

function makeAgentSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
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
    oddsChangePct: 20,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "correct",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    signalId: "signal-1",
    event: "settled",
    matchId: "match-1",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    resultStatus: "correct",
    momentumScore: 50,
    oddsChangePct: 20,
    archivedAt: new Date().toISOString(),
    signalData: makeAgentSignal(),
    ...overrides,
  };
}

describe("findSimilarSignals", () => {
  it("returns the empty result for no entries", () => {
    expect(findSimilarSignals([], { signalType: "SHARP_MOVE" })).toEqual({
      count: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyPct: 0,
      signals: [],
    });
  });

  it("returns the empty result when signalType is missing from the target", () => {
    const entries = [makeEntry()];
    expect(findSimilarSignals(entries, {})).toEqual({
      count: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyPct: 0,
      signals: [],
    });
  });

  it("excludes entries with a different signalType", () => {
    const entries = [
      makeEntry({ matchId: "m1", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "m2", signalType: "WATCH" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("m1");
  });

  it("excludes pending entries", () => {
    const entries = [
      makeEntry({ matchId: "m1", resultStatus: "pending" }),
      makeEntry({ matchId: "m2", resultStatus: "correct" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("m2");
  });

  it("excludes entries from the target's own match, including the totals-suffix form", () => {
    const entries = [
      makeEntry({ matchId: "18209181", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "18209181-totals-2.5", signalType: "SHARP_MOVE" }),
      makeEntry({ matchId: "18218149", signalType: "SHARP_MOVE" }),
    ];

    const result = findSimilarSignals(entries, {
      signalType: "SHARP_MOVE",
      excludeMatchId: "18209181-totals-3.5",
    });

    expect(result.count).toBe(1);
    expect(result.signals[0].matchId).toBe("18218149");
  });

  it("caps each other match to its 2 closest entries and ranks across matches by distance", () => {
    const entries = [
      makeEntry({ matchId: "match-x", oddsChangePct: 20, resultStatus: "correct" }),
      makeEntry({ matchId: "match-x", oddsChangePct: 22, resultStatus: "correct" }),
      makeEntry({ matchId: "match-x", oddsChangePct: 30, resultStatus: "incorrect" }),
      makeEntry({ matchId: "match-y", oddsChangePct: 21, resultStatus: "incorrect" }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE", oddsChangePct: 20 });

    expect(result.signals.map((s) => `${s.matchId}:${s.oddsChangePct}`)).toEqual([
      "match-x:20",
      "match-y:21",
      "match-x:22",
    ]);
    expect(result.count).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.incorrectCount).toBe(1);
    expect(result.accuracyPct).toBe(67);
  });

  it("caps the overall result at 5 entries, keeping the closest", () => {
    const entries = [0, 30, 60, 90, 120, 150].map((oddsChangePct, index) =>
      makeEntry({ matchId: `m${index}`, oddsChangePct })
    );

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE", oddsChangePct: 0 });

    expect(result.count).toBe(5);
    expect(result.signals.map((s) => s.matchId)).not.toContain("m5");
  });

  it("only factors fieldPressureScore into ranking when both target and candidate have it", () => {
    const entries = [
      makeEntry({
        matchId: "match-a",
        oddsChangePct: 20,
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 10 } },
        }),
      }),
      makeEntry({
        matchId: "match-b",
        oddsChangePct: 20,
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 40 } },
        }),
      }),
      makeEntry({
        matchId: "match-c",
        oddsChangePct: 25,
        signalData: makeAgentSignal({ evidence: { source: "txline" } }),
      }),
    ];

    const result = findSimilarSignals(entries, {
      signalType: "SHARP_MOVE",
      oddsChangePct: 20,
      fieldPressureScore: 10,
    });

    expect(result.signals.map((s) => s.matchId)).toEqual(["match-a", "match-c", "match-b"]);
  });

  it("carries fieldPressureScore, severity, and archivedAt through to each returned entry", () => {
    const entries = [
      makeEntry({
        matchId: "m1",
        severity: "HIGH",
        archivedAt: "2026-07-01T00:00:00.000Z",
        signalData: makeAgentSignal({
          evidence: { source: "txline", scoresContext: { fieldPressureScore: 30 } },
        }),
      }),
    ];

    const result = findSimilarSignals(entries, { signalType: "SHARP_MOVE" });

    expect(result.signals[0]).toEqual({
      matchId: "m1",
      signalType: "SHARP_MOVE",
      severity: "HIGH",
      oddsChangePct: 20,
      fieldPressureScore: 30,
      resultStatus: "correct",
      archivedAt: "2026-07-01T00:00:00.000Z",
    });
  });
});
