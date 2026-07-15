import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../store";
import type { Match, OddsSnapshot } from "../types";
import { ensureMatchOddsHistory, type MatchHistoryDependencies } from "./matchHistory";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Norway",
    awayTeam: "England",
    homeScore: 1,
    awayScore: 2,
    minute: 90,
    status: "finished",
    lastUpdated: "2026-07-11T23:59:57.382Z",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snapshot-1",
    matchId: "match-1",
    homeTeam: "Norway",
    awayTeam: "England",
    homeOdds: 2,
    drawOdds: 3.2,
    awayOdds: 3.8,
    homeScore: 1,
    awayScore: 2,
    minute: 90,
    source: "txline",
    createdAt: "2026-07-11T22:00:00.000Z",
    ...overrides,
  };
}

function makeDependencies(overrides: Partial<MatchHistoryDependencies> = {}): MatchHistoryDependencies {
  return {
    getArchivedOddsSnapshots: vi.fn().mockResolvedValue([]),
    fetchTxLineOddsHistoryForMatch: vi.fn().mockResolvedValue([]),
    archiveOddsSnapshots: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ensureMatchOddsHistory", () => {
  beforeEach(() => {
    store.matches = [];
    store.recentFinishedMatches = [makeMatch()];
    store.oddsSnapshots = [];
  });

  it("returns hot snapshots chronologically without querying slower sources", async () => {
    const older = makeSnapshot({ id: "older", createdAt: "2026-07-11T20:00:00.000Z" });
    const newer = makeSnapshot({ id: "newer", createdAt: "2026-07-11T22:00:00.000Z" });
    store.oddsSnapshots = [newer, older];
    const dependencies = makeDependencies();

    const result = await ensureMatchOddsHistory("match-1", dependencies);

    expect(result).toEqual({ history: [older, newer], source: "hot" });
    expect(dependencies.getArchivedOddsSnapshots).not.toHaveBeenCalled();
  });

  it("hydrates archived snapshots into the hot store", async () => {
    const archived = makeSnapshot({ id: "archived" });
    const dependencies = makeDependencies({
      getArchivedOddsSnapshots: vi.fn().mockResolvedValue([archived]),
    });

    const result = await ensureMatchOddsHistory("match-1", dependencies);

    expect(result).toEqual({ history: [archived], source: "archive" });
    expect(store.oddsSnapshots).toContainEqual(archived);
    expect(dependencies.fetchTxLineOddsHistoryForMatch).not.toHaveBeenCalled();
  });

  it("recovers and archives real TxLINE history for a finished match", async () => {
    const recovered = makeSnapshot({ id: "recovered" });
    const dependencies = makeDependencies({
      fetchTxLineOddsHistoryForMatch: vi.fn().mockResolvedValue([recovered]),
    });

    const result = await ensureMatchOddsHistory("match-1", dependencies);

    expect(result).toEqual({ history: [recovered], source: "txline_recovery" });
    expect(dependencies.fetchTxLineOddsHistoryForMatch).toHaveBeenCalledWith(store.recentFinishedMatches[0]);
    expect(dependencies.archiveOddsSnapshots).toHaveBeenCalledWith([recovered]);
  });

  it("does not recover history for live or scheduled matches", async () => {
    store.recentFinishedMatches = [];
    store.matches = [makeMatch({ status: "live" })];
    const dependencies = makeDependencies();

    const result = await ensureMatchOddsHistory("match-1", dependencies);

    expect(result).toEqual({ history: [], source: "unavailable" });
    expect(dependencies.fetchTxLineOddsHistoryForMatch).not.toHaveBeenCalled();
  });

  it("shares one in-flight recovery across concurrent requests", async () => {
    let resolveRecovery!: (snapshots: OddsSnapshot[]) => void;
    const recovery = new Promise<OddsSnapshot[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const fetchRecovery = vi.fn().mockReturnValue(recovery);
    const dependencies = makeDependencies({ fetchTxLineOddsHistoryForMatch: fetchRecovery });

    const first = ensureMatchOddsHistory("match-1", dependencies);
    const second = ensureMatchOddsHistory("match-1", dependencies);
    resolveRecovery([makeSnapshot({ id: "shared" })]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { history: [expect.objectContaining({ id: "shared" })], source: "txline_recovery" },
      { history: [expect.objectContaining({ id: "shared" })], source: "txline_recovery" },
    ]);
    expect(fetchRecovery).toHaveBeenCalledTimes(1);
  });

  it("returns an honest unavailable result when no real source has data", async () => {
    const result = await ensureMatchOddsHistory("match-1", makeDependencies());

    expect(result).toEqual({ history: [], source: "unavailable" });
  });
});
