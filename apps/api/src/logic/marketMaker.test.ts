import { describe, expect, it } from "vitest";
import { computeMarketMakerQuote } from "./marketMaker";
import type { Match, OddsSnapshot } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    status: "live",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snapshot-1",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.5,
    drawOdds: 3.2,
    homeScore: 0,
    awayScore: 0,
    minute: 45,
    source: "txline",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeMarketMakerQuote", () => {
  it("quotes the narrowest 2% spread when reliable and no field pressure", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 0, reliability: "RELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(2);
    expect(quote.spreadWidth).toBe("NARROW");
  });

  it("quotes the widest 16% spread when suspended and HIGH_DANGER pressure", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 45, reliability: "SUSPENDED" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(16);
    expect(quote.spreadWidth).toBe("WIDE");
  });

  it("computes the exact spread for an UNRELIABLE, ATTACK-pressure moment", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 22, reliability: "UNRELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    // 2 + (22/45)*6 + 4 = 2 + 2.9333... + 4 = 8.93 (rounded to 2 decimals)
    expect(quote.spreadPct).toBe(8.93);
    expect(quote.spreadWidth).toBe("MODERATE");
  });

  it("defaults to fieldPressureScore 0 and reliability UNKNOWN when scoresContext is missing", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({ evidence: undefined });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.fieldPressureScore).toBe(0);
    expect(quote.reliability).toBe("UNKNOWN");
    expect(quote.spreadPct).toBe(2);
  });

  it("never quotes a bid below the 1.01 decimal-odds floor for a heavy favorite", () => {
    const match = makeMatch();
    // 1.04 is a real odds value observed in this app's own production data
    // (Colombia vs Ghana). At the worst-case 16% spread this would otherwise
    // compute to 1.04 * 0.92 = 0.957, an invalid decimal odds value.
    const snapshot = makeSnapshot({
      homeOdds: 1.04,
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 45, reliability: "SUSPENDED" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.bidOdds.home).toBeGreaterThanOrEqual(1.01);
  });

  it("always keeps bid < fair < ask for every side", () => {
    const match = makeMatch();
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 32, reliability: "UNRELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    for (const side of ["home", "away", "draw"] as const) {
      expect(quote.bidOdds[side]).toBeLessThan(quote.fairOdds[side]);
      expect(quote.fairOdds[side]).toBeLessThan(quote.askOdds[side]);
    }
  });

  it("labels spread width NARROW at the exact 4% boundary", () => {
    const match = makeMatch();
    // fieldPressureScore=15 gives pressureContribution = (15/45)*6 = 2 exactly,
    // for a total of 2 (base) + 2 = 4% - the NARROW/MODERATE boundary.
    const snapshot = makeSnapshot({
      evidence: {
        source: "txline",
        scoresContext: { fieldPressureScore: 15, reliability: "RELIABLE" },
      },
    });

    const quote = computeMarketMakerQuote(match, snapshot);

    expect(quote.spreadPct).toBe(4);
    expect(quote.spreadWidth).toBe("NARROW");
  });
});
