import { describe, expect, it } from "vitest";
import { summarizeEventLatency } from "./eventLatency";
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
    event: "created",
    matchId: "match-1",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    resultStatus: "pending",
    momentumScore: 50,
    oddsChangePct: 20,
    archivedAt: new Date().toISOString(),
    signalData: makeAgentSignal(),
    ...overrides,
  };
}

describe("summarizeEventLatency", () => {
  it("returns null when no entries have both timestamps", () => {
    const entries = [
      makeEntry({ signalData: makeAgentSignal({ evidence: undefined }) }),
    ];

    expect(summarizeEventLatency(entries)).toBeNull();
  });

  it("excludes entries missing either timestamp from the sample", () => {
    const withBoth = makeEntry({
      signalId: "signal-with-both",
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:03.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:00.000Z" },
        },
      }),
    });
    const missingScoresContext = makeEntry({
      signalId: "signal-missing-context",
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:03.000Z",
        },
      }),
    });

    const result = summarizeEventLatency([withBoth, missingScoresContext]);

    expect(result?.sampledCount).toBe(1);
  });

  it("computes a positive gap as-is and reports zero negative gaps", () => {
    const entry = makeEntry({
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:05.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:00.000Z" },
        },
      }),
    });

    const result = summarizeEventLatency([entry]);

    expect(result?.sampledCount).toBe(1);
    expect(result?.medianGapMs).toBe(5000);
    expect(result?.negativeGapCount).toBe(0);
    expect(result?.negativeGapPct).toBe(0);
  });

  it("reports a negative gap using its absolute value, but counts it as negative", () => {
    const entry = makeEntry({
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          // currentTimestamp is BEFORE scoresContext.timestamp - a
          // feed-polling artifact, not real precognition.
          currentTimestamp: "2026-07-11T12:00:00.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:08.000Z" },
        },
      }),
    });

    const result = summarizeEventLatency([entry]);

    expect(result?.sampledCount).toBe(1);
    expect(result?.medianGapMs).toBe(8000);
    expect(result?.negativeGapCount).toBe(1);
    expect(result?.negativeGapPct).toBe(100);
  });

  it("computes percentiles correctly across a known small set", () => {
    const gapsMs = [1000, 2000, 3000, 4000, 5000];
    const entries = gapsMs.map((gapMs, index) =>
      makeEntry({
        signalId: `signal-${index}`,
        signalData: makeAgentSignal({
          evidence: {
            source: "txline",
            currentTimestamp: new Date(gapMs).toISOString(),
            scoresContext: { timestamp: new Date(0).toISOString() },
          },
        }),
      })
    );

    const result = summarizeEventLatency(entries);

    expect(result?.sampledCount).toBe(5);
    expect(result?.medianGapMs).toBe(3000);
    expect(result?.p25GapMs).toBe(2000);
    expect(result?.p75GapMs).toBe(4000);
    expect(result?.negativeGapCount).toBe(0);
  });
});
