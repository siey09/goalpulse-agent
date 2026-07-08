import { describe, expect, it } from "vitest";
import { computeDissent, summarizeDissent } from "./councilDissent";
import type { CouncilVoteEntry } from "./councilDissent";

function makeVotes(overrides: Partial<Record<"a" | "b" | "c", CouncilVoteEntry["vote"]>> = {}): CouncilVoteEntry[] {
  return [
    { agent: "Agent A - Movement Detector", vote: overrides.a ?? "approve", reason: "reason A" },
    { agent: "Agent B - Mean Reversion Guard", vote: overrides.b ?? "approve", reason: "reason B" },
    { agent: "Agent C - Evidence Correlator", vote: overrides.c ?? "approve", reason: "reason C" },
  ];
}

describe("computeDissent", () => {
  it("is unanimous when all three agents approve", () => {
    expect(computeDissent(makeVotes())).toEqual({ unanimous: true, dissentingAgents: [] });
  });

  it("lists the one dissenting agent when two of three approve", () => {
    expect(computeDissent(makeVotes({ b: "watch" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent B - Mean Reversion Guard"],
    });
  });

  it("lists both dissenting agents in the 1-of-3 watch case", () => {
    expect(computeDissent(makeVotes({ b: "watch", c: "watch" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent B - Mean Reversion Guard", "Agent C - Evidence Correlator"],
    });
  });

  it("lists Agent A when it rejects even if B and C approve", () => {
    expect(computeDissent(makeVotes({ a: "reject" }))).toEqual({
      unanimous: false,
      dissentingAgents: ["Agent A - Movement Detector"],
    });
  });
});

describe("summarizeDissent", () => {
  it("returns zero counts and an empty dissentByAgent for an empty run", () => {
    expect(summarizeDissent([])).toEqual({
      unanimousSignals: 0,
      dissentingSignals: 0,
      dissentRatePct: 0,
      dissentByAgent: {},
    });
  });

  it("counts unanimous vs dissenting signals across a run", () => {
    const perSignalVotes = [
      makeVotes(),
      makeVotes({ b: "watch" }),
      makeVotes({ b: "watch", c: "watch" }),
      makeVotes(),
    ];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.unanimousSignals).toBe(2);
    expect(summary.dissentingSignals).toBe(2);
    expect(summary.dissentRatePct).toBe(50);
  });

  it("includes an agent at 0 in dissentByAgent if it never dissents", () => {
    const perSignalVotes = [makeVotes({ b: "watch" }), makeVotes({ b: "watch" })];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.dissentByAgent).toEqual({
      "Agent A - Movement Detector": 0,
      "Agent B - Mean Reversion Guard": 2,
      "Agent C - Evidence Correlator": 0,
    });
  });

  it("rounds dissentRatePct and handles a run where every signal dissents", () => {
    const perSignalVotes = [makeVotes({ a: "reject" }), makeVotes({ a: "reject" }), makeVotes()];

    const summary = summarizeDissent(perSignalVotes);

    expect(summary.unanimousSignals).toBe(1);
    expect(summary.dissentingSignals).toBe(2);
    expect(summary.dissentRatePct).toBe(67);
  });
});
