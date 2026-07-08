import { describe, expect, it } from "vitest";
import { detectSteamMove } from "./steamDetection";
import type { OddsSnapshot } from "../types";

const BASE_TIME = new Date("2026-07-08T12:00:00.000Z").getTime();

function iso(secondsFromStart: number): string {
  return new Date(BASE_TIME + secondsFromStart * 1000).toISOString();
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap",
    matchId: "match-1",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeOdds: 2.0,
    awayOdds: 3.0,
    drawOdds: 3.25,
    homeScore: 0,
    awayScore: 0,
    minute: 40,
    source: "txline",
    createdAt: iso(0),
    ...overrides,
  };
}

describe("detectSteamMove", () => {
  it("returns null when there are too few snapshots to evaluate", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 1.9 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("returns null when the trailing run has fewer than 3 consecutive qualifying moves", () => {
    // 3 possible moves, but only the last 2 qualify (>=1%) - the first move
    // (2.00 -> 1.99, 0.5%) breaks the streak, so the trailing run is only 2
    // long, one short of the required 3. This exercises the "moves don't
    // qualify" branch distinctly from having too few snapshots to evaluate
    // at all (covered by the previous test).
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 1.99, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(60), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(90), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("detects a steam move on the home side", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 1.98, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(180), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.side).toBe("home");
    expect(result?.tickCount).toBe(3);
    expect(result?.firstOdds).toBe(2.0);
    expect(result?.lastOdds).toBe(1.88);
    expect(result?.totalMovePct).toBe(6);
    expect(result?.windowMs).toBe(180000);
    expect(result?.matchId).toBe("match-1");
    expect(result?.match).toBe("Team A vs Team B");
  });

  it("detects a steam move on the away side when the home side is flat", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 2.0, awayOdds: 2.94 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 2.0, awayOdds: 2.85 }),
      makeSnapshot({ id: "s3", createdAt: iso(180), homeOdds: 2.0, awayOdds: 2.73 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.side).toBe("away");
    expect(result?.tickCount).toBe(3);
  });

  it("returns null when a qualifying streak's window exceeds 5 minutes", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.0, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(60), homeOdds: 1.98, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(120), homeOdds: 1.94, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(400), homeOdds: 1.88, awayOdds: 3.0 }),
    ];

    expect(detectSteamMove(snapshots)).toBeNull();
  });

  it("only counts the trailing run after a break, ignoring an earlier isolated qualifying move", () => {
    const snapshots = [
      makeSnapshot({ id: "s0", createdAt: iso(0), homeOdds: 2.2, awayOdds: 3.0 }),
      makeSnapshot({ id: "s1", createdAt: iso(30), homeOdds: 2.15, awayOdds: 3.0 }),
      makeSnapshot({ id: "s2", createdAt: iso(60), homeOdds: 2.148, awayOdds: 3.0 }),
      makeSnapshot({ id: "s3", createdAt: iso(90), homeOdds: 2.1, awayOdds: 3.0 }),
      makeSnapshot({ id: "s4", createdAt: iso(120), homeOdds: 2.05, awayOdds: 3.0 }),
      makeSnapshot({ id: "s5", createdAt: iso(150), homeOdds: 2.0, awayOdds: 3.0 }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.tickCount).toBe(3);
    expect(result?.firstOdds).toBe(2.148);
    expect(result?.lastOdds).toBe(2.0);
    expect(result?.firstTickAt).toBe(iso(60));
    expect(result?.lastTickAt).toBe(iso(150));
  });

  it("uses matchLabel over homeTeam/awayTeam when present (totals-market case)", () => {
    const snapshots = [
      makeSnapshot({
        id: "s0",
        createdAt: iso(0),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 2.0,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s1",
        createdAt: iso(60),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.98,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s2",
        createdAt: iso(120),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.94,
        awayOdds: 3.0,
      }),
      makeSnapshot({
        id: "s3",
        createdAt: iso(180),
        matchId: "wc-usa-bra-totals-3.5",
        homeTeam: "Over 3.5",
        awayTeam: "Under 3.5",
        matchLabel: "USA vs Brazil",
        homeOdds: 1.88,
        awayOdds: 3.0,
      }),
    ];

    const result = detectSteamMove(snapshots);

    expect(result).not.toBeNull();
    expect(result?.matchId).toBe("wc-usa-bra-totals-3.5");
    expect(result?.match).toBe("USA vs Brazil");
  });
});
