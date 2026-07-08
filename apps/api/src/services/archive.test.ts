import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
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
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(queryResult).then(resolve, reject);
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertMock,
      ...makeQueryBuilder(),
    })),
  })),
}));

import { config } from "../config";
import { archiveSignal, getArchivedSignals, isTotalsMatchId } from "./archive";
import type { AgentSignal } from "../types";

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

describe("archiveSignal", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    insertMock.mockReset();
    queryResult = { data: [], count: 0, error: null };
  });

  it("no-ops when Supabase is not configured", async () => {
    await archiveSignal(makeSignal(), "created");

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the correct row shape when configured", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockResolvedValue({ error: null });

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

    expect(insertMock).toHaveBeenCalledWith({
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
    });
  });

  it("does not throw when the mocked insert rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockRejectedValue(new Error("network error"));

    await expect(archiveSignal(makeSignal(), "created")).resolves.toBeUndefined();
  });

  it("snapshots signal_data at call time, unaffected by later mutation of the same object", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockResolvedValue({ error: null });

    const signal = makeSignal({ resultStatus: "pending" });

    await archiveSignal(signal, "created");

    // Simulates the same object later being mutated by
    // evaluatePendingSignalsForFinishedMatches in a later (or the same)
    // cycle, after the fire-and-forget "created" insert was already queued.
    signal.resultStatus = "correct";

    const insertedRow = insertMock.mock.calls[0][0] as { signal_data: AgentSignal };
    expect(insertedRow.signal_data.resultStatus).toBe("pending");
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
