import { describe, expect, it } from "vitest";
import { toCompositionSegments, toRoiGeometry } from "./commandCenterOverview";

describe("commandCenterOverview", () => {
  it("preserves counts and calculates a complete composition", () => {
    expect(
      toCompositionSegments([
        { id: "confirmed", label: "Confirmed", count: 2, tone: "positive" },
        { id: "rejected", label: "Rejected", count: 1, tone: "danger" },
        { id: "pending", label: "Pending", count: 1, tone: "warning" },
      ])
    ).toEqual({
      total: 4,
      segments: [
        { id: "confirmed", label: "Confirmed", count: 2, tone: "positive", percent: 50 },
        { id: "rejected", label: "Rejected", count: 1, tone: "danger", percent: 25 },
        { id: "pending", label: "Pending", count: 1, tone: "warning", percent: 25 },
      ],
    });
  });

  it("returns zero percentages instead of NaN when every count is zero", () => {
    const result = toCompositionSegments([
      { id: "live", label: "Live", count: 0, tone: "positive" },
      { id: "upcoming", label: "Upcoming", count: 0, tone: "info" },
      { id: "finished", label: "Finished", count: 0, tone: "neutral" },
    ]);

    expect(result.total).toBe(0);
    expect(result.segments.map((segment) => segment.percent)).toEqual([0, 0, 0]);
  });

  it("clamps invalid negative counts to zero", () => {
    const result = toCompositionSegments([
      { id: "confirmed", label: "Confirmed", count: -2, tone: "positive" },
      { id: "pending", label: "Pending", count: 2, tone: "warning" },
    ]);

    expect(result.total).toBe(2);
    expect(result.segments[0]).toMatchObject({ count: 0, percent: 0 });
    expect(result.segments[1]).toMatchObject({ count: 2, percent: 100 });
  });

  it("places positive and negative ROI on opposite sides of zero", () => {
    expect(toRoiGeometry(20, [20, -10, 0])).toEqual({ direction: "positive", widthPercent: 100 });
    expect(toRoiGeometry(-10, [20, -10, 0])).toEqual({ direction: "negative", widthPercent: 50 });
    expect(toRoiGeometry(0, [20, -10, 0])).toEqual({ direction: "neutral", widthPercent: 0 });
  });
});
