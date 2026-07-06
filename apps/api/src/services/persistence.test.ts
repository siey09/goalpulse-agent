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
  });

  it("saveSnapshot no-ops when Supabase is not configured", async () => {
    await saveSnapshot();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("loadSnapshot no-ops when Supabase is not configured", async () => {
    await loadSnapshot();

    expect(maybeSingleMock).not.toHaveBeenCalled();
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

  it("loadSnapshot does not throw when the mocked call rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockRejectedValue(new Error("network error"));

    await expect(loadSnapshot()).resolves.toBeUndefined();
  });
});
