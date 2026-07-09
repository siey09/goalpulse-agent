import { describe, expect, it } from "vitest";
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./signalPerformance";
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
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
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
      {
        signalType: "SHARP_MOVE",
        settledCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        accuracyPct: 100,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
      {
        signalType: "MOMENTUM_SHIFT",
        settledCount: 2,
        correctCount: 1,
        incorrectCount: 1,
        accuracyPct: 50,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
    ]);
  });

  it("excludes pending entries from settledCount", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", resultStatus: "pending" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result).toEqual([
      {
        signalType: "SHARP_MOVE",
        settledCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        accuracyPct: 100,
        distinctMatchCount: 1,
        largestMatchSharePct: 100,
      },
    ]);
  });

  it("reports distinctMatchCount and largestMatchSharePct across two evenly-split matches", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", matchId: "match-1", resultStatus: "correct" }),
      makeEntry({ signalId: "s1", signalType: "SHARP_MOVE", matchId: "match-2", resultStatus: "incorrect" }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result[0].distinctMatchCount).toBe(2);
    expect(result[0].largestMatchSharePct).toBe(50);
  });

  it("collapses totals sub-markets of the same fixture into one match for diversity counting", () => {
    const entries = [
      makeEntry({ signalId: "s0", signalType: "SHARP_MOVE", matchId: "18202783", resultStatus: "correct" }),
      makeEntry({
        signalId: "s1",
        signalType: "SHARP_MOVE",
        matchId: "18202783-totals-0.75",
        resultStatus: "incorrect",
      }),
      makeEntry({
        signalId: "s2",
        signalType: "SHARP_MOVE",
        matchId: "18202783-totals-1.5",
        resultStatus: "incorrect",
      }),
    ];

    const result = summarizeSignalTypePerformance(entries);

    expect(result[0].distinctMatchCount).toBe(1);
    expect(result[0].largestMatchSharePct).toBe(100);
  });
});

describe("summarizeConfidenceScorePerformance", () => {
  it("returns an empty array for no entries", () => {
    expect(summarizeConfidenceScorePerformance([])).toEqual([]);
  });

  it("excludes entries without a confidenceScore", () => {
    const entries = [makeEntry({ signalId: "s0", resultStatus: "correct" })];

    expect(summarizeConfidenceScorePerformance(entries)).toEqual([]);
  });

  it("computes accuracy for a single bucket with mixed outcomes", () => {
    const entries = [
      makeEntry({
        signalId: "s0",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 30 }),
      }),
      makeEntry({
        signalId: "s1",
        resultStatus: "incorrect",
        signalData: makeAgentSignal({ confidenceScore: 40 }),
      }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result).toEqual([
      { bucket: "25-50", settledCount: 2, correctCount: 1, incorrectCount: 1, accuracyPct: 50 },
    ]);
  });

  it("returns multiple buckets in ascending order regardless of input order", () => {
    const entries = [
      makeEntry({
        signalId: "s0",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 90 }),
      }),
      makeEntry({
        signalId: "s1",
        resultStatus: "correct",
        signalData: makeAgentSignal({ confidenceScore: 10 }),
      }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result.map((r) => r.bucket)).toEqual(["0-25", "75-100"]);
  });

  it("places boundary values in the correct adjacent bucket", () => {
    const entries = [
      makeEntry({ signalId: "s0", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 24.9 }) }),
      makeEntry({ signalId: "s1", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 25.0 }) }),
      makeEntry({ signalId: "s2", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 49.9 }) }),
      makeEntry({ signalId: "s3", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 50.0 }) }),
      makeEntry({ signalId: "s4", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 74.9 }) }),
      makeEntry({ signalId: "s5", resultStatus: "correct", signalData: makeAgentSignal({ confidenceScore: 75.0 }) }),
    ];

    const result = summarizeConfidenceScorePerformance(entries);

    expect(result.map((r) => [r.bucket, r.settledCount])).toEqual([
      ["0-25", 1],
      ["25-50", 2],
      ["50-75", 2],
      ["75-100", 1],
    ]);
  });
});
