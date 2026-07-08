import { describe, expect, it } from "vitest";
import { filterOutConfirmedFinishedFixtures } from "./txlineClient";
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
