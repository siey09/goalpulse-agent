import { describe, expect, it } from "vitest";
import { isScoresContextFresh } from "./scoresContextFreshness";

const TOLERANCE_MS = 60_000;

describe("isScoresContextFresh", () => {
  it("is fresh when the tick and context timestamps are exactly equal", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is fresh when the gap is just under the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:59.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is not fresh when the gap is just over the threshold", () => {
    const tickTs = new Date("2026-07-07T01:01:01.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(false);
  });

  it("is not fresh when the tick timestamp is missing", () => {
    expect(
      isScoresContextFresh(undefined, "2026-07-07T01:00:00.000Z", TOLERANCE_MS)
    ).toBe(false);
  });

  it("is not fresh when the context timestamp is missing", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();

    expect(isScoresContextFresh(tickTs, undefined, TOLERANCE_MS)).toBe(false);
  });

  it("is fresh when the context timestamp is slightly ahead of the tick, within the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:00:05.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(true);
  });

  it("is not fresh when the context timestamp is far ahead of the tick, beyond the threshold", () => {
    const tickTs = new Date("2026-07-07T01:00:00.000Z").getTime();
    const contextTimestamp = "2026-07-07T01:02:00.000Z";

    expect(isScoresContextFresh(tickTs, contextTimestamp, TOLERANCE_MS)).toBe(false);
  });
});
