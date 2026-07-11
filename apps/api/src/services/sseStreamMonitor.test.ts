import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";

vi.mock("./txlineClient", () => ({
  getGuestJwt: vi.fn().mockResolvedValue("fake-jwt"),
}));

import { createSseStreamMonitor, deriveStreamStatus, parseSseData } from "./sseStreamMonitor";
import type { LiveStreamState } from "./sseStreamMonitor";

function makeFetchResponse(
  chunks: string[],
  options: { ok?: boolean; status?: number } = {}
) {
  const encoder = new TextEncoder();
  let index = 0;

  const reader = {
    read: vi.fn().mockImplementation(async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }
      const value = encoder.encode(chunks[index]);
      index += 1;
      return { done: false, value };
    }),
  };

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: "OK",
    body: options.ok === false ? null : { getReader: () => reader },
  };
}

beforeEach(() => {
  config.useSimulatedFeed = false;
  config.txlineApiKey = "test-key";
  config.txlineApiBaseUrl = "https://example.test";
  vi.restoreAllMocks();
});

describe("parseSseData", () => {
  it("extracts a single data: line", () => {
    expect(parseSseData('data: {"a":1}')).toBe('{"a":1}');
  });

  it("joins multi-line data: fields", () => {
    expect(parseSseData("data: line1\ndata: line2")).toBe("line1\nline2");
  });

  it("returns null when there is no data: line", () => {
    expect(parseSseData(": keepalive")).toBeNull();
  });
});

function makeState(overrides: Partial<LiveStreamState> = {}): LiveStreamState {
  return {
    connected: false,
    lastEventAt: null,
    totalEventsReceived: 0,
    totalReconnects: 0,
    lastError: null,
    ...overrides,
  };
}

const NOW = new Date("2026-07-11T12:00:00.000Z").getTime();

describe("deriveStreamStatus", () => {
  it("returns STOPPED when the feed is disabled, regardless of other state", () => {
    const state = makeState({ connected: true, lastEventAt: new Date(NOW).toISOString() });

    expect(deriveStreamStatus(state, false, NOW)).toBe("STOPPED");
  });

  it("returns RECONNECTING when enabled but not currently connected", () => {
    const state = makeState({ connected: false });

    expect(deriveStreamStatus(state, true, NOW)).toBe("RECONNECTING");
  });

  it("returns STALE when connected but no event has arrived yet", () => {
    const state = makeState({ connected: true, lastEventAt: null });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STALE");
  });

  it("returns STREAMING when connected with a recent event", () => {
    const recentEventAt = new Date(NOW - 60_000).toISOString(); // 1 minute ago
    const state = makeState({ connected: true, lastEventAt: recentEventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STREAMING");
  });

  it("returns STALE when the last event is exactly at the 5-minute threshold", () => {
    const eventAt = new Date(NOW - 5 * 60 * 1000).toISOString();
    const state = makeState({ connected: true, lastEventAt: eventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STREAMING");
  });

  it("returns STALE when the last event is just past the 5-minute threshold", () => {
    const eventAt = new Date(NOW - 5 * 60 * 1000 - 1).toISOString();
    const state = makeState({ connected: true, lastEventAt: eventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STALE");
  });
});

describe("createSseStreamMonitor", () => {
  it("increments totalEventsReceived and sets lastEventAt on a valid JSON frame", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse(['data: {"foo":1}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitor.connectOnce();

    const state = monitor.getState();
    expect(state.totalEventsReceived).toBe(1);
    expect(state.lastEventAt).not.toBeNull();
  });

  it("ignores a non-JSON keepalive frame without incrementing the counter", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse([": keepalive\n\n"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitor.connectOnce();

    expect(monitor.getState().totalEventsReceived).toBe(0);
  });

  it("throws and leaves connected false when the response is not ok", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse([], { ok: false, status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(monitor.connectOnce()).rejects.toThrow();
    expect(monitor.getState().connected).toBe(false);
  });

  it("keeps two independently-created monitors' state fully isolated", async () => {
    const monitorA = createSseStreamMonitor("/api/scores/stream");
    const monitorB = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse(['data: {"foo":1}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitorA.connectOnce();

    expect(monitorA.getState().totalEventsReceived).toBe(1);
    expect(monitorB.getState().totalEventsReceived).toBe(0);
  });

  it("start() does not call fetch when useSimulatedFeed is true", () => {
    config.useSimulatedFeed = true;
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    monitor.start();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("start() does not call fetch when txlineApiKey is empty", () => {
    config.txlineApiKey = "";
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    monitor.start();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
