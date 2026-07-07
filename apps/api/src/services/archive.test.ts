import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  })),
}));

import { config } from "../config";
import { archiveSignal } from "./archive";
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

    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow.signal_data.resultStatus).toBe("pending");
  });
});
