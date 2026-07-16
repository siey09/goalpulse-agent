import { describe, expect, it } from "vitest";
import { replayIntervalForSpeed, replayProgressLabel } from "./replayState";

describe("replay state", () => {
  it.each([
    [0.5, 2000],
    [1, 1000],
    [2, 500],
  ] as const)("maps %sx playback to a %sms interval", (speed, intervalMs) => {
    expect(replayIntervalForSpeed(speed)).toBe(intervalMs);
  });

  it("describes a playing replay using its real historical capture", () => {
    expect(replayProgressLabel({
      status: "playing",
      cursor: 4,
      total: 10,
      originalTimestamp: "2026-07-11T22:59:14",
      intervalMs: 1000,
    })).toBe("Snapshot 4 of 10 · Historical 10:59:14 PM · 1 snapshot/s");
  });

  it("describes a paused replay without implying movement", () => {
    expect(replayProgressLabel({ status: "paused", cursor: 4, total: 10, intervalMs: 1000 }))
      .toBe("Paused at snapshot 4 of 10");
  });

  it("describes completion using the real snapshot total", () => {
    expect(replayProgressLabel({ status: "complete", cursor: 10, total: 10, intervalMs: 1000 }))
      .toBe("Replay complete · 10 real snapshots");
  });
});
