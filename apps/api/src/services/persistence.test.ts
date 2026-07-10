import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: upsertMock,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
    })),
  })),
}));

import { config } from "../config";
import { store } from "../store";
import { loadSnapshot, saveSnapshot } from "./persistence";

describe("persistence", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    upsertMock.mockReset();
    maybeSingleMock.mockReset();
    store.matches = [];
    store.recentFinishedMatches = [];
    store.oddsSnapshots = [];
    store.signals = [];
    store.agentRuns = [];
    store.duplicatesDropped = { snapshots: 0, signals: 0 };
  });

  it("saveSnapshot no-ops when Supabase is not configured", async () => {
    await saveSnapshot();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("loadSnapshot no-ops when Supabase is not configured", async () => {
    await loadSnapshot();

    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("saveSnapshot includes duplicatesDropped in the upserted payload", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    store.duplicatesDropped = { snapshots: 7, signals: 2 };

    await saveSnapshot();

    const upsertedRow = upsertMock.mock.calls[0][0] as { data: { duplicatesDropped: unknown } };
    expect(upsertedRow.data.duplicatesDropped).toEqual({ snapshots: 7, signals: 2 });
  });

  it("loadSnapshot restores duplicatesDropped, defaulting to zero when absent from an older snapshot", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockResolvedValue({
      data: {
        data: {
          matches: [],
          recentFinishedMatches: [],
          oddsSnapshots: [],
          signals: [],
          agentRuns: [],
        },
      },
      error: null,
    });

    await loadSnapshot();

    expect(store.duplicatesDropped).toEqual({ snapshots: 0, signals: 0 });
  });

  it("loadSnapshot populates store from a successful mocked load", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockResolvedValue({
      data: {
        data: {
          matches: [{ id: "match-1" }],
          recentFinishedMatches: [],
          oddsSnapshots: [],
          signals: [],
          agentRuns: [],
        },
      },
      error: null,
    });

    await loadSnapshot();

    expect(store.matches).toEqual([{ id: "match-1" }]);
  });

  it("loadSnapshot restores oddsSnapshots sorted newest-first, self-healing any legacy out-of-order data", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    // A persisted snapshot saved while the recent-results merge bug was live
    // could have out-of-order createdAt values baked in permanently.
    maybeSingleMock.mockResolvedValue({
      data: {
        data: {
          matches: [],
          recentFinishedMatches: [],
          oddsSnapshots: [
            { id: "a", createdAt: "2026-07-09T21:40:29.076Z" },
            { id: "b", createdAt: "2026-07-09T21:40:34.507Z" },
            { id: "c", createdAt: "2026-07-09T21:39:53.655Z" },
            { id: "d", createdAt: "2026-07-09T21:34:12.689Z" },
          ],
          signals: [],
          agentRuns: [],
        },
      },
      error: null,
    });

    await loadSnapshot();

    const timestamps = store.oddsSnapshots.map((s) => new Date(s.createdAt).getTime());
    const sortedDescending = [...timestamps].sort((a, b) => b - a);

    expect(timestamps).toEqual(sortedDescending);
  });

  it("loadSnapshot does not throw when the mocked call rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockRejectedValue(new Error("network error"));

    await expect(loadSnapshot()).resolves.toBeUndefined();
  });
});
