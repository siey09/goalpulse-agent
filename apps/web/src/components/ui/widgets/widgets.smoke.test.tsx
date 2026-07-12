import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusCapsule } from "./StatusCapsule";
import { BarHistogram } from "./BarHistogram";
import { SegmentedGauge } from "./SegmentedGauge";
import { RadialDial } from "./RadialDial";
import { DeltaTicker } from "./DeltaTicker";
import { SparklinePath } from "./SparklinePath";
import { ProgressCapsule } from "./ProgressCapsule";

describe("widget shapes", () => {
  it("StatusCapsule renders label and value", () => {
    render(<StatusCapsule label="Feed freshness" value="8s ago" pulse />);
    expect(screen.getByText("Feed freshness")).toBeInTheDocument();
    expect(screen.getByText("8s ago")).toBeInTheDocument();
  });

  it("BarHistogram renders with empty buckets instead of crashing", () => {
    expect(() => render(<BarHistogram label="Signals in window" value={0} buckets={[]} />)).not.toThrow();
    expect(screen.getByText("Signals in window")).toBeInTheDocument();
  });

  it("SegmentedGauge clamps an out-of-range active segment", () => {
    expect(() =>
      render(<SegmentedGauge label="Verification" value="44" segmentCount={5} activeSegment={99} />)
    ).not.toThrow();
  });

  it("RadialDial clamps percent below 0 and above 100", () => {
    expect(() => render(<RadialDial label="System health" value="120%" percent={140} />)).not.toThrow();
    expect(() => render(<RadialDial label="System health" value="-10%" percent={-10} />)).not.toThrow();
  });

  it("DeltaTicker renders without a spark row when sparkValues is omitted", () => {
    render(<DeltaTicker label="Strategy ROI" value="+377.51%" delta="+12.4%" />);
    expect(screen.getByText("+377.51%")).toBeInTheDocument();
  });

  it("SparklinePath skips the line when fewer than two points are given", () => {
    expect(() => render(<SparklinePath label="Latest signal" value="13.18%" points={[1]} />)).not.toThrow();
  });

  it("ProgressCapsule never clamps the displayed value even past the cap", () => {
    render(<ProgressCapsule label="Open positions" value={27} cap={20} />);
    expect(screen.getByText("27")).toBeInTheDocument();
  });
});
