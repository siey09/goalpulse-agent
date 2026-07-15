import { describe, expect, it } from "vitest";
import { chartDataKeyForSignalSide } from "./chartSeries";

describe("chartDataKeyForSignalSide", () => {
  it("maps draw markers to the draw series instead of home", () => {
    expect(chartDataKeyForSignalSide("home")).toBe("home");
    expect(chartDataKeyForSignalSide("draw")).toBe("draw");
    expect(chartDataKeyForSignalSide("away")).toBe("away");
    expect(chartDataKeyForSignalSide(undefined)).toBe("home");
  });
});
