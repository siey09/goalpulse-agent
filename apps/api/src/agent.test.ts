import { describe, expect, it } from "vitest";
import { findNewlySettledSignals, findPendingSignals } from "./agent";
import type { AgentSignal } from "./types";

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

describe("findPendingSignals", () => {
  it("returns only signals with resultStatus 'pending' from a mixed list", () => {
    const pending = makeSignal({ id: "signal-pending", resultStatus: "pending" });
    const correct = makeSignal({ id: "signal-correct", resultStatus: "correct" });
    const incorrect = makeSignal({ id: "signal-incorrect", resultStatus: "incorrect" });

    const result = findPendingSignals([pending, correct, incorrect]);

    expect(result).toEqual([pending]);
  });
});

describe("findNewlySettledSignals", () => {
  it("detects a signal whose resultStatus was mutated away from pending after being captured", () => {
    const signal = makeSignal({ id: "signal-1", resultStatus: "pending" });
    const capturedWhilePending = [signal];

    // Simulates evaluatePendingSignalsForFinishedMatches mutating the same
    // object in place, the way store.ts actually does it.
    signal.resultStatus = "correct";

    const result = findNewlySettledSignals(capturedWhilePending);

    expect(result).toEqual([signal]);
  });

  it("excludes a signal that is still pending", () => {
    const stillPending = makeSignal({ id: "signal-2", resultStatus: "pending" });
    const capturedWhilePending = [stillPending];

    const result = findNewlySettledSignals(capturedWhilePending);

    expect(result).toEqual([]);
  });
});
