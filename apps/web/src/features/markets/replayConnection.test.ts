import { describe, expect, it, vi } from "vitest";
import {
  createReplayRetryState,
  replayStreamUrl,
  scheduleReplayReconnect,
} from "./replayConnection";

describe("controlled replay reconnects", () => {
  it("schedules one bounded reconnect whose URL uses the latest cursor", () => {
    const state = createReplayRetryState();
    const timers: Array<() => void> = [];
    const retryUrls: string[] = [];
    let cursor = 1;
    const options = {
      state,
      getCursor: () => cursor,
      setTimer: (callback: () => void) => {
        timers.push(callback);
        return timers.length;
      },
      onReconnect: (latestCursor: number) => {
        retryUrls.push(replayStreamUrl("https://api.test", "match 1", latestCursor, 500));
      },
    };

    expect(scheduleReplayReconnect(options)).toBe("scheduled");
    expect(scheduleReplayReconnect(options)).toBe("pending");
    expect(timers).toHaveLength(1);

    cursor = 4;
    timers[0]();
    expect(retryUrls).toEqual([
      "https://api.test/api/live/replay-stream?matchId=match+1&startCursor=4&intervalMs=500",
    ]);

    expect(scheduleReplayReconnect(options)).toBe("scheduled");
    timers[1]();
    expect(scheduleReplayReconnect(options)).toBe("scheduled");
    timers[2]();
    expect(scheduleReplayReconnect(options)).toBe("exhausted");
    expect(retryUrls).toHaveLength(3);
  });

  it("reports a duplicate error as pending rather than retry exhaustion", () => {
    const state = createReplayRetryState();
    const timers: Array<() => void> = [];
    const options = {
      state,
      getCursor: () => 2,
      setTimer: (callback: () => void) => {
        timers.push(callback);
        return timers.length;
      },
      onReconnect: vi.fn(),
    };

    expect(scheduleReplayReconnect(options)).toBe("scheduled");
    expect(scheduleReplayReconnect(options)).toBe("pending");
    expect(state.attempt).toBe(1);
    expect(timers).toHaveLength(1);
  });

  it("backs off each controlled retry", () => {
    const state = createReplayRetryState();
    const delays: number[] = [];
    const timers: Array<() => void> = [];
    const setTimer = vi.fn((callback: () => void, delay: number) => {
      delays.push(delay);
      timers.push(callback);
      return delays.length;
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      scheduleReplayReconnect({ state, getCursor: () => 0, setTimer, onReconnect: vi.fn() });
      timers[attempt]();
    }

    expect(delays).toEqual([250, 500, 1000]);
  });
});
