import { describe, expect, it } from "vitest";
import { buildSignalFromSnapshots } from "./signalEngine";
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
});
