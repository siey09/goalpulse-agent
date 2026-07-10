import { describe, expect, it } from "vitest";
import { buildSignalFromSnapshots, calculateConfidenceScore } from "./signalEngine";
import type { OddsSnapshot } from "../types";

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: overrides.id ?? "snapshot-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 2.0,
    drawOdds: 3.0,
    homeScore: 0,
    awayScore: 0,
    minute: 10,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildSignalFromSnapshots", () => {
  it("returns null when there is no previous snapshot to compare against", () => {
    const current = makeSnapshot();
    expect(buildSignalFromSnapshots(current, undefined)).toBeNull();
  });

  it("returns null when odds movement is below the WATCH threshold (4%)", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // 2.0 -> 1.95 is a 2.5% compression, below the 4% floor.
    const current = makeSnapshot({ homeOdds: 1.95, awayOdds: 2.0 });

    expect(buildSignalFromSnapshots(current, previous)).toBeNull();
  });

  it("classifies a 4-8% move as a LOW severity WATCH signal", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // 2.0 -> 1.9 is a 5% compression.
    const current = makeSnapshot({ homeOdds: 1.9, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.severity).toBe("LOW");
    expect(signal?.signalType).toBe("WATCH");
  });

  it("classifies an 8-15% move as a MEDIUM severity MOMENTUM_SHIFT signal", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // 2.0 -> 1.8 is a 10% compression.
    const current = makeSnapshot({ homeOdds: 1.8, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.severity).toBe("MEDIUM");
    expect(signal?.signalType).toBe("MOMENTUM_SHIFT");
  });

  it("classifies a 15%+ move as a HIGH severity SHARP_MOVE signal", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // 2.0 -> 1.5 is a 25% compression.
    const current = makeSnapshot({ homeOdds: 1.5, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.severity).toBe("HIGH");
    expect(signal?.signalType).toBe("SHARP_MOVE");
  });

  it("picks the side with the larger compression, not just the home side by default", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    // Home barely moves (2.5%), away compresses sharply (25%).
    const current = makeSnapshot({ homeOdds: 1.95, awayOdds: 1.5 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.side).toBe("away");
    expect(signal?.target).toBe("Team B");
    expect(signal?.oddsBefore).toBe(2.0);
    expect(signal?.oddsAfter).toBe(1.5);
  });

  it("uses matchLabel for the match display string when present (multi-market support)", () => {
    const previous = makeSnapshot({
      homeTeam: "Over 3.5",
      awayTeam: "Under 3.5",
      matchLabel: "Portugal vs Spain",
      homeOdds: 2.0,
      awayOdds: 2.0,
    });
    const current = makeSnapshot({
      homeTeam: "Over 3.5",
      awayTeam: "Under 3.5",
      matchLabel: "Portugal vs Spain",
      homeOdds: 1.5,
      awayOdds: 2.0,
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.match).toBe("Portugal vs Spain");
    expect(signal?.target).toBe("Over 3.5");
  });

  it("falls back to 'home vs away' team names when no matchLabel is set", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    const current = makeSnapshot({ homeOdds: 1.5, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.match).toBe("Team A vs Team B");
  });

  it("clamps momentumScore to the 0-100 range", () => {
    const previous = makeSnapshot({ homeOdds: 100, awayOdds: 2.0 });
    // Extreme compression to stress-test the clamp.
    const current = makeSnapshot({ homeOdds: 1.01, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.momentumScore).toBeGreaterThanOrEqual(0);
    expect(signal?.momentumScore).toBeLessThanOrEqual(100);
  });

  it("computes a fully-blended confidenceScore when scoresContext is attached", () => {
    const previous = makeSnapshot({
      homeOdds: 2.0,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:00:00.000Z",
    });
    const current = makeSnapshot({
      homeOdds: 1.7,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:01:00.000Z",
      evidence: {
        source: "txline",
        scoresContext: {
          fieldPressureScore: 45,
          timestamp: "2026-07-08T10:01:00.000Z",
        },
      },
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.confidenceScore).toBe(100);
  });

  it("falls back to a magnitude-only confidenceScore when no scoresContext is attached", () => {
    const previous = makeSnapshot({
      homeOdds: 2.0,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:00:00.000Z",
    });
    const current = makeSnapshot({
      homeOdds: 1.85,
      awayOdds: 2.0,
      createdAt: "2026-07-08T10:01:00.000Z",
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.confidenceScore).toBe(50);
  });

  it("reduces confidenceScore and adds the longshot caveat when oddsAfter is a longshot", () => {
    const previous = makeSnapshot({ homeOdds: 5.0, awayOdds: 2.0 });
    // 5.0 -> 3.0 is a 40% compression (HIGH severity), and oddsAfter=3.0
    // exactly meets the longshot cliff.
    const current = makeSnapshot({ homeOdds: 3.0, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.oddsAfter).toBe(3);
    // No scoresContext -> magnitude-only base score is clamped to 100
    // (40% is beyond the 15% reference), then the 0.3 longshot factor
    // applies: 100*0.3=30.
    expect(signal?.confidenceScore).toBe(30);
    expect(signal?.explanation).toContain("long-shot odds (3)");
  });

  it("does not add the longshot caveat when oddsAfter is below the cliff", () => {
    const previous = makeSnapshot({ homeOdds: 2.0, awayOdds: 2.0 });
    const current = makeSnapshot({ homeOdds: 1.5, awayOdds: 2.0 });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal).not.toBeNull();
    expect(signal?.explanation).not.toContain("long-shot odds");
  });
});

describe("calculateConfidenceScore", () => {
  it("falls back to the magnitude component alone when no scoresContext is present", () => {
    // 7.5% is half of the 15% magnitude reference, so magnitudeScore is 50;
    // with no scoresContext, weight renormalizes to the magnitude component
    // alone, so the result is exactly 50, not dragged down by two missing
    // components. oddsAfter=1.5 is below the longshot cliff, so the base
    // score is returned unpenalized.
    expect(calculateConfidenceScore(7.5, undefined, null, 1.5)).toBe(50);
  });

  it("clamps the magnitude component at 100 for a move beyond the 15% reference", () => {
    expect(calculateConfidenceScore(25, undefined, null, 1.5)).toBe(100);
  });

  it("blends all three components with their configured weights", () => {
    // magnitude=15% -> 100, fieldPressureScore=0 -> 0, freshnessTightness=0.
    // Expected: 100*0.5 + 0*0.3 + 0*0.2 = 50.
    const scoresContext = { fieldPressureScore: 0 };
    expect(calculateConfidenceScore(15, scoresContext, 0, 1.5)).toBe(50);
  });

  it("applies the longshot penalty when oddsAfter is at or above the 3.0 cliff", () => {
    // Same inputs as the "clamps the magnitude component at 100..." case
    // above (baseScore 100), but oddsAfter=3 meets the cliff: 100*0.3=30.
    expect(calculateConfidenceScore(25, undefined, null, 3)).toBe(30);
  });

  it("does not apply the longshot penalty just under the 3.0 cliff", () => {
    expect(calculateConfidenceScore(25, undefined, null, 2.99)).toBe(100);
  });
});

describe("buildSignalFromSnapshots scoresContext fallback", () => {
  it("uses current's own scoresContext when present, without needing previous's", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:00:30.000Z",
      homeOdds: 1.8,
      evidence: {
        source: "txline",
        scoresContext: { timestamp: "2026-07-07T01:00:30.000Z", fieldPressureScore: 40 },
      },
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext?.fieldPressureScore).toBe(40);
  });

  it("falls back to previous's scoresContext when current has none and previous's is fresh relative to current's own timestamp", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
      evidence: {
        source: "txline",
        scoresContext: { timestamp: "2026-07-07T01:00:00.000Z", fieldPressureScore: 15 },
      },
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:00:30.000Z",
      homeOdds: 1.8,
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext?.fieldPressureScore).toBe(15);
  });

  it("drops to undefined when previous's scoresContext is stale relative to current's own timestamp, even though it was fresh for previous itself", () => {
    const previous = makeSnapshot({
      id: "snapshot-previous",
      createdAt: "2026-07-07T01:00:00.000Z",
      evidence: {
        source: "txline",
        // Fresh for previous's own moment (0s gap), but current arrives 90s
        // later - beyond the 60s tolerance.
        scoresContext: { timestamp: "2026-07-07T01:00:00.000Z", fieldPressureScore: 15 },
      },
    });
    const current = makeSnapshot({
      id: "snapshot-current",
      createdAt: "2026-07-07T01:01:30.000Z",
      homeOdds: 1.8,
    });

    const signal = buildSignalFromSnapshots(current, previous);

    expect(signal?.evidence?.scoresContext).toBeUndefined();
  });
});
