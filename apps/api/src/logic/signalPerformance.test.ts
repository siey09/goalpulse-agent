import { describe, expect, it } from "vitest";
import { summarizeSignalTypePerformance } from "./signalPerformance";
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
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
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

describe("summarizeSignalTypePerformance", () => {
  it("returns an empty array for no entries", () => {
    expect(summarizeSignalTypePerformance([])).toEqual([]);
  });

  it("computes accuracy for a single signal type with mixed outcomes", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s2", signalType: "SHARP_MOVE", resultStatus: "incorrect" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 3,
        correctCount: 2,
        incorrectCount: 1,
        accuracyPct: 67,
      },
    ]);
  });

  it("reports multiple signal types separately", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "MOMENTUM_SHIFT", resultStatus: "incorrect" }),
      makeEntry({ signalId: "s2", signalType: "MOMENTUM_SHIFT", resultStatus: "correct" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
      { signalType: "MOMENTUM_SHIFT", settledCount: 2, correctCount: 1, incorrectCount: 1, accuracyPct: 50 },
    ]);
  });

  it("excludes pending entries from settledCount", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "pending" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      { signalType: "SHARP_MOVE", settledCount: 1, correctCount: 1, incorrectCount: 0, accuracyPct: 100 },
    ]);
  });
});
