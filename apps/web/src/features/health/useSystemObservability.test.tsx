import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedHealth, SystemMetrics } from "./systemHealthModel";
import { useSystemObservability } from "./useSystemObservability";

const metrics: SystemMetrics = {
  uptimeSeconds: 7200,
  lastAgentCycle: null,
  liveStream: { connected: true, staleForMs: 1200, totalReconnects: 1, status: "STREAMING" },
  liveOddsStream: { connected: true, staleForMs: 800, totalReconnects: 0, status: "STREAMING" },
  duplicatesDropped: { snapshots: 2, signals: 1 },
};

const feedHealth: FeedHealth = {
  status: "healthy",
  cycleHealth: {
    lastRunAt: "2026-07-16T07:00:00.000Z",
    cycleGapMs: 3000,
    expectedIntervalMs: 3000,
    isCurrentGapExceeded: false,
    recentMissedCycles: 0,
  },
  oddsFreshness: { staleThresholdMs: 300_000, staleLiveMatchCount: 0, staleLiveMatches: [] },
  fixtureCoverage: {
    lastRunRawFixtureCount: 7,
    lastRunProcessedCount: 7,
    isCoverageDropped: false,
    recentCoverageDrops: 0,
  },
};

function response<T>(data: T, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => ({ data }) } as Response;
}

describe("useSystemObservability", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("updates metrics when feed health independently fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.endsWith("/api/metrics")
        ? response(metrics)
        : response(feedHealth, false);
    }));

    const { result } = renderHook(() => useSystemObservability());

    await waitFor(() => expect(result.current.metricsState).toBe("fresh"));
    expect(result.current.feedHealthState).toBe("unavailable");
    expect(result.current.metrics).toEqual(metrics);
    expect(result.current.feedHealth).toBeNull();
  });

  it("retains stale metrics while accepting a later feed-health update", async () => {
    let metricsCalls = 0;
    let feedCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/metrics")) {
        metricsCalls += 1;
        return response(metrics, metricsCalls === 1);
      }
      feedCalls += 1;
      return response({ ...feedHealth, status: feedCalls === 1 ? "healthy" : "degraded" } as FeedHealth);
    }));

    const { result } = renderHook(() => useSystemObservability());
    await waitFor(() => expect(result.current.feedHealthState).toBe("fresh"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(result.current.feedHealth?.status).toBe("degraded"));

    expect(result.current.metrics).toEqual(metrics);
    expect(result.current.metricsState).toBe("stale");
    expect(result.current.feedHealthState).toBe("fresh");
  });

  it("aborts active requests and clears polling on unmount", () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => undefined);
    }));

    const { unmount } = renderHook(() => useSystemObservability());
    expect(signals).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
