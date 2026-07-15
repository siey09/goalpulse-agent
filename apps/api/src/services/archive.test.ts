import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const fromMock = vi.fn();
let lastQueryBuilder: Record<string, ReturnType<typeof vi.fn>>;
let queryResult: { data: unknown[] | null; count: number | null; error: unknown } = {
  data: [],
  count: 0,
  error: null,
};

function makeQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.like = vi.fn(chain);
  builder.not = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(queryResult).then(resolve, reject);
  lastQueryBuilder = builder as Record<string, ReturnType<typeof vi.fn>>;
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: fromMock.mockImplementation(() => ({
      upsert: upsertMock,
      ...makeQueryBuilder(),
    })),
  })),
}));

import { config } from "../config";
import {
  archiveMatch,
  archiveOddsSnapshots,
  archiveSignal,
  getArchivedOddsSnapshots,
  getArchivedSignals,
  isTotalsMatchId,
} from "./archive";
import type { AgentSignal, Match, OddsSnapshot } from "../types";

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
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 2,
    awayScore: 1,
    minute: 90,
    status: "finished",
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
    homeOdds: 1.8,
    drawOdds: 3.2,
    awayOdds: 4.1,
    homeScore: 1,
    awayScore: 0,
    minute: 70,
    source: "txline",
    createdAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("odds snapshot archive", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    upsertMock.mockReset();
    fromMock.mockClear();
    queryResult = { data: [], count: 0, error: null };
  });

  it("deduplicates snapshots and archives their complete payload", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockResolvedValue({ error: null });
    const snapshot = makeSnapshot();

    await archiveOddsSnapshots([snapshot, { ...snapshot }]);

    expect(fromMock).toHaveBeenCalledWith("odds_snapshot_archive");
    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          snapshot_id: "snapshot-1",
          match_id: "match-1",
          created_at: "2026-07-15T10:00:00.000Z",
          snapshot_data: snapshot,
        },
      ],
      { onConflict: "snapshot_id", ignoreDuplicates: true }
    );
  });

  it("reads a match archive chronologically with a bounded limit", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    const older = makeSnapshot({ id: "older", createdAt: "2026-07-15T09:00:00.000Z" });
    const newer = makeSnapshot({ id: "newer", createdAt: "2026-07-15T10:00:00.000Z" });
    queryResult = {
      data: [{ snapshot_data: older }, { snapshot_data: newer }],
      count: 2,
      error: null,
    };

    const result = await getArchivedOddsSnapshots("match-1", 80);

    expect(result).toEqual([older, newer]);
    expect(lastQueryBuilder.eq).toHaveBeenCalledWith("match_id", "match-1");
    expect(lastQueryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(lastQueryBuilder.limit).toHaveBeenCalledWith(80);
  });

  it("fails open when archive reads error", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    queryResult = { data: null, count: null, error: new Error("supabase down") };

    await expect(getArchivedOddsSnapshots("match-1")).resolves.toEqual([]);
  });
});

describe("archiveSignal", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    upsertMock.mockReset();
    queryResult = { data: [], count: 0, error: null };
  });

  it("no-ops when Supabase is not configured", async () => {
    await archiveSignal(makeSignal(), "created");

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts the correct row shape with an onConflict/ignoreDuplicates guard when configured", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockResolvedValue({ error: null });

    const signal = makeSignal({
      id: "signal-42",
      matchId: "match-7",
      side: "away",
      signalType: "MOMENTUM_SHIFT",
      severity: "MEDIUM",
      resultStatus: "correct",
      momentumScore: 63.5,
      oddsChangePct: 12.25,
    });

    await archiveSignal(signal, "settled");

    expect(upsertMock).toHaveBeenCalledWith(
      {
        signal_id: "signal-42",
        event: "settled",
        match_id: "match-7",
        side: "away",
        signal_type: "MOMENTUM_SHIFT",
        severity: "MEDIUM",
        result_status: "correct",
        momentum_score: 63.5,
        odds_change_pct: 12.25,
        signal_data: signal,
      },
      { onConflict: "signal_id,event", ignoreDuplicates: true }
    );
  });

  it("does not throw when the mocked upsert rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockRejectedValue(new Error("network error"));

    await expect(archiveSignal(makeSignal(), "created")).resolves.toBeUndefined();
  });

  it("snapshots signal_data at call time, unaffected by later mutation of the same object", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockResolvedValue({ error: null });

    const signal = makeSignal({ resultStatus: "pending" });

    await archiveSignal(signal, "created");

    // Simulates the same object later being mutated by
    // evaluatePendingSignalsForFinishedMatches in a later (or the same)
    // cycle, after the fire-and-forget "created" upsert was already queued.
    signal.resultStatus = "correct";

    const upsertedRow = upsertMock.mock.calls[0][0] as { signal_data: AgentSignal };
    expect(upsertedRow.signal_data.resultStatus).toBe("pending");
  });
});

describe("isTotalsMatchId", () => {
  it("returns false for a plain 1X2 matchId", () => {
    expect(isTotalsMatchId("fixture-123")).toBe(false);
  });

  it("returns true for a totals matchId", () => {
    expect(isTotalsMatchId("fixture-123-totals-3.5")).toBe(true);
  });
});

describe("getArchivedSignals", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    queryResult = { data: [], count: 0, error: null };
  });

  it("returns empty data and zero totalCount when Supabase is not configured", async () => {
    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 0 },
    });
  });

  it("maps snake_case rows to the camelCase ArchiveEntry shape", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    const rawSignal = makeSignal({ id: "signal-9" });
    queryResult = {
      data: [
        {
          signal_id: "signal-9",
          event: "settled",
          match_id: "match-9",
          side: "home",
          signal_type: "SHARP_MOVE",
          severity: "HIGH",
          result_status: "correct",
          momentum_score: 75,
          odds_change_pct: 18.4,
          signal_data: rawSignal,
          archived_at: "2026-07-08T12:00:00.000Z",
        },
      ],
      count: 1,
      error: null,
    };

    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [
        {
          signalId: "signal-9",
          event: "settled",
          matchId: "match-9",
          side: "home",
          signalType: "SHARP_MOVE",
          severity: "HIGH",
          resultStatus: "correct",
          momentumScore: 75,
          oddsChangePct: 18.4,
          archivedAt: "2026-07-08T12:00:00.000Z",
          signalData: rawSignal,
        },
      ],
      pagination: { page: 1, pageSize: 25, totalCount: 1, totalPages: 1 },
    });
  });

  it("computes totalPages from totalCount and pageSize", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    queryResult = { data: [], count: 143, error: null };

    const result = await getArchivedSignals({}, { page: 2, pageSize: 25 });

    expect(result.pagination).toEqual({ page: 2, pageSize: 25, totalCount: 143, totalPages: 6 });
  });

  it("returns empty data and zero totalCount when the query errors", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    queryResult = { data: null, count: null, error: new Error("supabase down") };

    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 0 },
    });
  });
});

describe("archiveMatch", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    upsertMock.mockReset();
  });

  it("no-ops when Supabase is not configured", async () => {
    await archiveMatch(makeMatch());

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts the correct row shape with an onConflict/ignoreDuplicates guard when configured", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockResolvedValue({ error: null });

    const match = makeMatch({
      id: "18198205",
      competition: "FIFA World Cup",
      homeTeam: "France",
      awayTeam: "Morocco",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
    });

    await archiveMatch(match);

    expect(upsertMock).toHaveBeenCalledWith(
      {
        match_id: "18198205",
        competition: "FIFA World Cup",
        home_team: "France",
        away_team: "Morocco",
        home_score: 2,
        away_score: 0,
        status: "finished",
        match_data: match,
      },
      { onConflict: "match_id", ignoreDuplicates: true }
    );
  });

  it("does not throw when the mocked upsert rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    upsertMock.mockRejectedValue(new Error("network error"));

    await expect(archiveMatch(makeMatch())).resolves.toBeUndefined();
  });
});
