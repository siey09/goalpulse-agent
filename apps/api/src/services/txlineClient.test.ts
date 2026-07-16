import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { fetchTxLineFeed, fetchTxLineOddsHistoryForMatch, filterOutConfirmedFinishedFixtures } from "./txlineClient";
import type { Match } from "../types";
import { store } from "../store";

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
      Bookmaker: "Canonical Sportsbook",
      SuperOddsType: "1X2_PARTICIPANT_RESULT",
      MarketPeriod: null,
      MarketParameters: "line=main",
      InRunning: true,
      PriceNames: ["part1", "draw", "part2"],
      Prices: [2100, 3300, 3500],
    };
    const newer = {
      ...older,
      MessageId: "odds-newer",
      Ts: Date.parse("2026-07-11T22:00:00.000Z"),
      Prices: [1800, 3400, 4200],
    };
    const otherBookmaker = {
      ...older,
      MessageId: "odds-other-bookmaker",
      Bookmaker: "Different Sportsbook",
      Ts: Date.parse("2026-07-11T21:00:00.000Z"),
      Prices: [1200, 8000, 12000],
    };
    const otherMarketVariant = {
      ...older,
      MessageId: "odds-other-variant",
      MarketParameters: "line=alternate",
      Ts: Date.parse("2026-07-11T21:30:00.000Z"),
      Prices: [1300, 7000, 11000],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/guest/start")) {
        return new Response(JSON.stringify({ token: "guest-jwt" }), { status: 200 });
      }
      if (url.endsWith("/api/odds/updates/18213979")) {
        return new Response(JSON.stringify([otherBookmaker, newer, otherMarketVariant, older]), { status: 200 });
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

describe("fetchTxLineFeed health evidence", () => {
  beforeEach(() => {
    config.txlineApiBaseUrl = "https://txline.example";
    config.txlineApiKey = "test-api-key";
    store.matches = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("distinguishes raw discovery from supported-market eligibility", async () => {
    const supportedOdds = {
      FixtureId: 101,
      MessageId: "main-line",
      Ts: Date.parse("2026-07-16T08:00:00.000Z"),
      Bookmaker: "Canonical Sportsbook",
      SuperOddsType: "1X2_PARTICIPANT_RESULT",
      InRunning: true,
      PriceNames: ["part1", "draw", "part2"],
      Prices: [2100, 3300, 3500],
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/guest/start")) {
        return new Response(JSON.stringify({ token: "guest-jwt" }), { status: 200 });
      }
      if (url.endsWith("/api/fixtures/snapshot")) {
        return new Response(JSON.stringify([
          { FixtureId: 101, Participant1: "A", Participant2: "B" },
          { FixtureId: 102, Participant1: "C", Participant2: "D" },
        ]), { status: 200 });
      }
      if (url.includes("/api/scores/snapshot/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith("/api/odds/snapshot/101")) {
        return new Response(JSON.stringify([supportedOdds]), { status: 200 });
      }
      if (url.includes("/api/odds/")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const feed = await fetchTxLineFeed();

    expect(feed).toMatchObject({
      rawFixtureCount: 2,
      eligibleFixtureCount: 1,
      oddsEnrichmentFailures: 0,
    });
    expect(feed.matches).toHaveLength(1);
  });

  it("reports an odds enrichment failure separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/guest/start")) {
        return new Response(JSON.stringify({ token: "guest-jwt" }), { status: 200 });
      }
      if (url.endsWith("/api/fixtures/snapshot")) {
        return new Response(JSON.stringify([
          { FixtureId: 103, Participant1: "E", Participant2: "F" },
        ]), { status: 200 });
      }
      if (url.endsWith("/api/scores/snapshot/103")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith("/api/odds/snapshot/103")) {
        return new Response("upstream error", { status: 503, statusText: "Unavailable" });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const feed = await fetchTxLineFeed();

    expect(feed).toMatchObject({
      rawFixtureCount: 1,
      eligibleFixtureCount: 0,
      oddsEnrichmentFailures: 1,
    });
  });
});
