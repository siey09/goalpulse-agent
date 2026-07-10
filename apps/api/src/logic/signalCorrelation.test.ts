import { describe, expect, it } from "vitest";
import {
  findPatternMatchedClusters,
  findSignalClusters,
  sessionWindowGroups,
} from "./signalCorrelation";
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

  it("does not report a cluster when multiple totals-line signals all come from the same real match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(60),
        target: "Over 3.5",
      }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("dedupes matchIds/matchCount by real match when totals lines are mixed with a genuine second match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(30),
        target: "Over 3.5",
      }),
      makeSignal({ id: "s2", matchId: "fixture-2", createdAt: iso(60) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["fixture-1", "fixture-2"]);
    expect(clusters[0].matchCount).toBe(2);
    expect(clusters[0].signalCount).toBe(3);
  });
});

describe("sessionWindowGroups", () => {
  type TimedItem = { id: string; ts: string };

  it("groups items within the window into a single group", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(60) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("chains gaps each individually under the window into one group", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(240) },
      { id: "c", ts: iso(480) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("splits into separate groups when a gap exceeds the window", () => {
    const items: TimedItem[] = [
      { id: "a", ts: iso(0) },
      { id: "b", ts: iso(400) },
    ];

    const groups = sessionWindowGroups(items, (item) => item.ts, 300000);

    expect(groups).toHaveLength(2);
    expect(groups[0].map((item) => item.id)).toEqual(["a"]);
    expect(groups[1].map((item) => item.id)).toEqual(["b"]);
  });
});

describe("findPatternMatchedClusters", () => {
  it("does not report a cluster when only one match shares the pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-1", createdAt: iso(60), side: "home", severity: "HIGH" }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("reports a genuine 2-match pattern cluster within the window", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual({
      side: "home",
      severity: "HIGH",
      market: "1x2",
      matchIds: ["match-1", "match-2"],
      matchCount: 2,
      signalCount: 2,
      windowStart: iso(0),
      windowEnd: iso(60),
      spanMs: 60000,
      signalIds: ["s0", "s1"],
    });
  });

  it("evaluates two different patterns in the same window independently, only reporting the one reaching 2+ matches", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(90), side: "away", severity: "LOW" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].side).toBe("home");
    expect(clusters[0].severity).toBe("HIGH");
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
  });

  it("keeps 1x2 and totals signals separate even when side and severity match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "match-1",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Team A",
      }),
      makeSignal({
        id: "s1",
        matchId: "match-2",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 3.5",
      }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("chains gaps into one cluster when all signals share the same pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });

  it("does not report a pattern cluster when multiple totals-line signals sharing the same pattern all come from the same real match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 3.5",
      }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("dedupes pattern-cluster matchIds/matchCount by real match across a genuine 2-match totals pattern", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-2-totals-2.5",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["fixture-1", "fixture-2"]);
    expect(clusters[0].matchCount).toBe(2);
    expect(clusters[0].market).toBe("totals");
  });
});
