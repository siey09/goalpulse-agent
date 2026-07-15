import { describe, expect, it } from "vitest";
import {
  buildMarketTimeline,
  findNearestMarketSnapshot,
  type OddsSnapshot,
} from "./chartTimeline";

function snapshot(
  id: string,
  timestamp: string | undefined,
  homeOdds: number,
  drawOdds: number,
  awayOdds: number
): OddsSnapshot {
  return { id, timestamp, homeOdds, drawOdds, awayOdds };
}

describe("buildMarketTimeline", () => {
  it("sorts captures chronologically and preserves their real time spacing and prices", () => {
    const points = buildMarketTimeline([
      snapshot("ten", "2026-07-15T10:10:00.000Z", 1.7, 3.7, 5.1),
      snapshot("zero", "2026-07-15T10:00:00.000Z", 1.9, 3.5, 4.8),
      snapshot("one", "2026-07-15T10:01:00.000Z", 1.8, 3.6, 4.9),
    ]);

    expect(points.map((point) => point.id)).toEqual(["zero", "one", "ten"]);
    expect(points[1].timelineX - points[0].timelineX).toBe(60_000);
    expect(points[2].timelineX - points[1].timelineX).toBe(9 * 60_000);
    expect(points.map(({ rawTimestamp, home, draw, away }) => ({ rawTimestamp, home, draw, away }))).toEqual([
      { rawTimestamp: "2026-07-15T10:00:00.000Z", home: 1.9, draw: 3.5, away: 4.8 },
      { rawTimestamp: "2026-07-15T10:01:00.000Z", home: 1.8, draw: 3.6, away: 4.9 },
      { rawTimestamp: "2026-07-15T10:10:00.000Z", home: 1.7, draw: 3.7, away: 5.1 },
    ]);
  });

  it("uses createdAt and keeps captures with duplicate display times uniquely addressable", () => {
    const points = buildMarketTimeline([
      { id: "first", createdAt: "2026-07-15T10:00:01.000Z", market: { homeOdds: 2.1 } },
      { id: "second", createdAt: "2026-07-15T10:00:30.000Z", market: { homeOdds: 2.0 } },
    ]);

    expect(points[0].name).toBe(points[1].name);
    expect(points.map((point) => point.id)).toEqual(["first", "second"]);
    expect(new Set(points.map((point) => point.id)).size).toBe(2);
    expect(points.every((point) => point.hasRealTimestamp)).toBe(true);
  });

  it("retains required signal-adjacent captures in addition to the latest non-signal cap", () => {
    const captures = Array.from({ length: 21 }, (_, index) =>
      snapshot(
        `capture-${index}`,
        new Date(Date.UTC(2026, 6, 15, 10, index)).toISOString(),
        2 - index / 100,
        3 + index / 100,
        4 + index / 100
      )
    );

    const points = buildMarketTimeline(captures, new Set(["capture-0"]), 18);

    expect(points).toHaveLength(19);
    expect(points[0].id).toBe("capture-0");
    expect(points.slice(1).map((point) => point.id)).toEqual(
      Array.from({ length: 18 }, (_, index) => `capture-${index + 3}`)
    );
  });

  it("finds and retains a createdAt-only capture adjacent to a signal", () => {
    const captures: OddsSnapshot[] = [
      { id: "adjacent", createdAt: "2026-07-15T10:00:30.000Z", homeOdds: 2.1 },
      { id: "later", createdAt: "2026-07-15T10:05:00.000Z", homeOdds: 2.0 },
    ];
    const nearest = findNearestMarketSnapshot(captures, "2026-07-15T10:00:40.000Z");

    expect(nearest?.id).toBe("adjacent");
    expect(buildMarketTimeline(captures, new Set([nearest!.id!]), 0).map((point) => point.id)).toEqual([
      "adjacent",
    ]);
  });

  it("resolves a signal to its exact source snapshot before timestamp proximity", () => {
    const captures: OddsSnapshot[] = [
      { id: "timestamp-nearest", createdAt: "2026-07-15T10:00:00.000Z", homeOdds: 2.1 },
      { id: "signal-source", createdAt: "2026-07-15T10:05:00.000Z", homeOdds: 1.8 },
    ];

    const resolved = findNearestMarketSnapshot(
      captures,
      "2026-07-15T10:00:01.000Z",
      "signal-source"
    );
    const markerPoint = buildMarketTimeline(captures).find((point) => point.id === resolved?.id);

    expect(resolved?.id).toBe("signal-source");
    expect(markerPoint?.timelineX).toBe(Date.parse("2026-07-15T10:05:00.000Z"));
  });

  it("does not use timestamp proximity when a declared source snapshot is absent", () => {
    const captures: OddsSnapshot[] = [
      { id: "timestamp-nearest", createdAt: "2026-07-15T10:00:00.000Z", homeOdds: 2.1 },
    ];

    expect(
      findNearestMarketSnapshot(captures, "2026-07-15T10:00:01.000Z", "not-revealed-yet")
    ).toBeUndefined();
  });

  it("deduplicates snapshots by ID before applying the cap", () => {
    const points = buildMarketTimeline([
      snapshot("same", "2026-07-15T10:00:00.000Z", 2.1, 3.1, 4.1),
      snapshot("same", "2026-07-15T10:01:00.000Z", 2.0, 3.0, 4.0),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: "same", rawTimestamp: "2026-07-15T10:01:00.000Z", home: 2.0 });
  });

  it("keeps generated IDs distinct from genuine backend snapshot IDs", () => {
    const points = buildMarketTimeline([
      { timestamp: "2026-07-15T10:00:00.000Z", homeOdds: 2.1 },
      snapshot("snapshot-0", "2026-07-15T10:01:00.000Z", 2.0, 3.0, 4.0),
    ]);

    expect(points.map((point) => point.id)).toHaveLength(2);
    expect(new Set(points.map((point) => point.id)).size).toBe(2);
  });

  it("allows the non-signal cap to be zero", () => {
    const points = buildMarketTimeline(
      [
        snapshot("required", "2026-07-15T10:00:00.000Z", 2.1, 3.1, 4.1),
        snapshot("ordinary", "2026-07-15T10:01:00.000Z", 2.0, 3.0, 4.0),
      ],
      new Set(["required"]),
      0
    );

    expect(points.map((point) => point.id)).toEqual(["required"]);
  });

  it("gives timestamp-free captures ordered plot positions without displaying invented dates", () => {
    const points = buildMarketTimeline([
      snapshot("first", undefined, 2.1, 3.1, 4.1),
      snapshot("second", undefined, 2.0, 3.0, 4.0),
      snapshot("third", undefined, 1.9, 2.9, 3.9),
    ]);

    expect(points.map((point) => point.timelineX)).toEqual([0, 1, 2]);
    expect(points.map((point) => point.name)).toEqual(["S1", "S2", "S3"]);
    expect(points.map((point) => point.hasRealTimestamp)).toEqual([false, false, false]);
    expect(points.map((point) => point.rawTimestamp)).toEqual(["", "", ""]);
    expect(points.map((point) => point.timelineLabel)).toEqual([
      "Capture time unavailable",
      "Capture time unavailable",
      "Capture time unavailable",
    ]);
  });
});
