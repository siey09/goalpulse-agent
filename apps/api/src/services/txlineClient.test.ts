import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { fetchTxLineOddsHistoryForMatch, filterOutConfirmedFinishedFixtures } from "./txlineClient";
import type { Match } from "../types";

type TestFixture = { FixtureId: number; StartTime?: number };

function makeFixture(overrides: Partial<TestFixture> = {}): TestFixture {
  return { FixtureId: 1, ...overrides };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 90,
    status: "finished",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe("filterOutConfirmedFinishedFixtures", () => {
  it("passes through a fixture with no prior match entry at all", () => {
    const fixtures = [makeFixture({ FixtureId: 99 })];
    const priorMatchesById = new Map<string, Match>();

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
    expect(result[0].FixtureId).toBe(99);
  });

  it("passes through a fixture whose prior match status was live", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "live" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
  });

  it("passes through a fixture whose prior match status was scheduled", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "scheduled" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
  });

  it("filters out a fixture whose prior match status was finished", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "finished" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(0);
  });

  it("filters a mixed batch correctly, preserving relative order", () => {
    const fixtures = [
      makeFixture({ FixtureId: 1 }),
      makeFixture({ FixtureId: 2 }),
      makeFixture({ FixtureId: 3 }),
      makeFixture({ FixtureId: 4 }),
    ];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "finished" })],
      ["2", makeMatch({ id: "2", status: "live" })],
      ["3", makeMatch({ id: "3", status: "finished" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result.map((fixture) => fixture.FixtureId)).toEqual([2, 4]);
  });
});

describe("fetchTxLineOddsHistoryForMatch", () => {
  beforeEach(() => {
    config.txlineApiBaseUrl = "https://txline.example";
    config.txlineApiKey = "test-api-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers chronological 1X2 history for an arbitrary fixture id", async () => {
    const older = {
      FixtureId: 18213979,
      MessageId: "odds-older",
      Ts: Date.parse("2026-07-11T20:00:00.000Z"),
      SuperOddsType: "1X2_PARTICIPANT_RESULT",
      MarketPeriod: null,
      PriceNames: ["part1", "draw", "part2"],
      Prices: [2100, 3300, 3500],
    };
    const newer = {
      ...older,
      MessageId: "odds-newer",
      Ts: Date.parse("2026-07-11T22:00:00.000Z"),
      Prices: [1800, 3400, 4200],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/guest/start")) {
        return new Response(JSON.stringify({ token: "guest-jwt" }), { status: 200 });
      }
      if (url.endsWith("/api/odds/updates/18213979")) {
        return new Response(JSON.stringify([newer, older]), { status: 200 });
      }
      if (url.endsWith("/api/odds/snapshot/18213979")) {
        return new Response(JSON.stringify([newer]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const history = await fetchTxLineOddsHistoryForMatch(
      makeMatch({
        id: "18213979",
        homeTeam: "Norway",
        awayTeam: "England",
        homeScore: 1,
        awayScore: 2,
      })
    );

    expect(history.map((snapshot) => snapshot.evidence?.messageId)).toEqual([
      "odds-older",
      "odds-newer",
    ]);
    expect(history.map((snapshot) => snapshot.matchId)).toEqual(["18213979", "18213979"]);
    expect(history[0]).toMatchObject({ homeOdds: 2.1, drawOdds: 3.3, awayOdds: 3.5 });
  });

  it("returns no synthetic history when TxLINE recovery is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/guest/start")) {
        return new Response(JSON.stringify({ token: "guest-jwt" }), { status: 200 });
      }
      return new Response("gone", { status: 410, statusText: "Gone" });
    }));

    await expect(fetchTxLineOddsHistoryForMatch(makeMatch({ id: "99999999" }))).resolves.toEqual([]);
  });
});
