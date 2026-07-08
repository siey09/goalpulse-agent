import { describe, expect, it } from "vitest";
import { findSignalClusters } from "./signalCorrelation";
import type { AgentSignal } from "../types";

const BASE_TIME = new Date("2026-07-08T14:00:00.000Z").getTime();

function iso(secondsFromStart: number): string {
  return new Date(BASE_TIME + secondsFromStart * 1000).toISOString();
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
    explanation: "test",
    createdAt: iso(0),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("findSignalClusters", () => {
  it("does not report a cluster when all signals are from the same single match", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-1", createdAt: iso(60) }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(120) }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("does not report a cluster when different matches are too far apart in time", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(400) }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("reports a genuine 2-match cluster within the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual({
      matchIds: ["match-1", "match-2"],
      matchCount: 2,
      signalCount: 2,
      severityBreakdown: { high: 2, medium: 0, low: 0 },
      windowStart: iso(0),
      windowEnd: iso(60),
      spanMs: 60000,
      signalIds: ["s0", "s1"],
    });
  });

  it("chains gaps each individually under the window into one cluster spanning longer than the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240) }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480) }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });

  it("identifies two separate clusters when an idle gap exceeds the window between them", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0) }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60) }),
      makeSignal({ id: "s2", matchId: "match-3", createdAt: iso(460) }),
      makeSignal({ id: "s3", matchId: "match-4", createdAt: iso(520) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[1].matchIds).toEqual(["match-3", "match-4"]);
  });

  it("counts a mixed-severity cluster's severityBreakdown correctly", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), severity: "MEDIUM" }),
      makeSignal({ id: "s2", matchId: "match-2", createdAt: iso(120), severity: "LOW" }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].severityBreakdown).toEqual({ high: 1, medium: 1, low: 1 });
  });
});
