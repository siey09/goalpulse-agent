import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Match } from "../../types";
import { OddsMovementChart, type OddsMovementChartProps } from "./OddsMovementChart";
import type { LiveMarketsChartMarker, LiveMarketsChartPoint } from "./LiveMarketsPage";

vi.mock("recharts", () => ({
  Area: ({ type, dataKey, isAnimationActive }: { type?: string; dataKey?: string; isAnimationActive?: boolean }) => (
    <div
      data-testid="price-area"
      data-series={dataKey}
      data-type={type}
      data-animation-active={String(isAnimationActive)}
    />
  ),
  AreaChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ReferenceDot: () => null,
  ReferenceLine: ({ x, label, className }: { x?: number; label?: { value?: string }; className?: string }) => (
    <div data-testid="capture-cursor" data-x={x} data-label={label?.value} className={className} />
  ),
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: ({ dataKey, type, scale, tickFormatter }: { dataKey?: string; type?: string; scale?: string; tickFormatter?: (value: number) => string }) => (
    <div
      data-testid="historical-x-axis"
      data-key={dataKey}
      data-type={type}
      data-scale={scale}
      data-missing-time-label={tickFormatter?.(1_700_000_000_001)}
    />
  ),
  YAxis: () => null,
}));

const selectedMatch: Match = {
  id: "m1",
  homeTeam: "Norway",
  awayTeam: "England",
  status: "live",
  homeScore: 1,
  awayScore: 0,
};

const marker: LiveMarketsChartMarker = {
  id: "signal-1",
  x: 0,
  y: 1.85,
  label: "Sharp move",
  target: "Norway",
  severity: "HIGH",
  oddsChangePct: -7.5,
};

function chartPoint(overrides: Partial<LiveMarketsChartPoint> = {}): LiveMarketsChartPoint {
  return {
    id: "snapshot-1",
    name: "S1",
    timelineX: 0,
    hasRealTimestamp: false,
    rawTimestamp: "",
    snapshotLabel: "TxLINE snapshot 1",
    timelineLabel: "Capture time unavailable",
    ...overrides,
  };
}

const baseProps: OddsMovementChartProps = {
  selectedMatch,
  chartData: [
    chartPoint({
      home: 1.9,
      draw: 3.4,
      away: 4.1,
      timelineLabel: "Captured at 11:10 PM",
    }),
  ],
  chartSignalMarkers: [],
  chartReadout: {
    homeCurrent: "1.90",
    drawCurrent: "3.40",
    awayCurrent: "4.10",
    verdict: "Market steady",
    meaning: "No material move yet.",
    signalStatus: "No signal marker on this chart yet",
    severity: {
      tier: "Watch",
      cardClass: "border-white/10 bg-black/20",
      textClass: "text-stone-300",
      dotClass: "bg-stone-400",
      badgeClass: "border-white/10 text-stone-300",
    },
  },
  onSelectSignalId: vi.fn(),
  isReplayStreamMode: false,
  isOddsStreamLive: true,
  streamProgressPercent: 100,
};

describe("OddsMovementChart", () => {
  it("includes Draw in the accessible series summary only when real draw data exists", () => {
    const { rerender } = render(
      <OddsMovementChart {...baseProps} chartData={[chartPoint({ home: 1.9, draw: 3.4, away: 4.1 })]} />
    );
    expect(screen.getByRole("columnheader", { name: "Draw odds" })).toBeInTheDocument();

    rerender(<OddsMovementChart {...baseProps} chartData={[chartPoint({ home: 1.9, away: 4.1 })]} />);
    expect(screen.queryByRole("columnheader", { name: "Draw odds" })).not.toBeInTheDocument();
  });

  it("offers a keyboard-accessible inspect action for every signal marker", () => {
    const onSelectSignalId = vi.fn();
    render(<OddsMovementChart {...baseProps} chartSignalMarkers={[marker]} onSelectSignalId={onSelectSignalId} />);

    fireEvent.click(screen.getByRole("button", { name: /inspect signal.*sharp move/i }));
    expect(onSelectSignalId).toHaveBeenCalledWith(marker.id);
    expect(screen.getByRole("button", { name: /inspect signal.*sharp move/i })).toHaveTextContent("HIGH");
  });

  it("uses collision-safe keys for repeated snapshot labels", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repeatedPoint = chartPoint({ home: 1.9, away: 4.1, timelineLabel: "Captured now" });

    render(<OddsMovementChart {...baseProps} chartData={[repeatedPoint, repeatedPoint]} />);

    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key/i);
    consoleError.mockRestore();
  });

  it("names the chart and explains snapshot semantics", () => {
    render(<OddsMovementChart {...baseProps} />);
    expect(screen.getByRole("img", { name: /odds movement for Norway vs England/i })).toHaveAccessibleDescription(/TxLINE snapshot/i);
  });

  it("renders historical captures as an unanimated step tape", () => {
    render(<OddsMovementChart {...baseProps} />);

    expect(screen.getByText(/Historical capture time/i)).toBeInTheDocument();
    expect(screen.getByText(/Observed price holds until the next snapshot/i)).toBeInTheDocument();
    expect(screen.getByTestId("historical-x-axis")).toHaveAttribute("data-key", "timelineX");
    expect(screen.getByTestId("historical-x-axis")).toHaveAttribute("data-type", "number");
    expect(screen.getByTestId("historical-x-axis")).toHaveAttribute("data-scale", "time");

    for (const area of screen.getAllByTestId("price-area")) {
      expect(area).toHaveAttribute("data-type", "stepAfter");
      expect(area).toHaveAttribute("data-animation-active", "false");
    }

    expect(screen.getByTestId("capture-cursor")).toHaveAttribute("data-label", "Current");
    expect(screen.getByTestId("capture-cursor")).toHaveClass("market-capture-cursor", "motion-reduce:transition-none");
  });

  it("animates the price tape while replay is streaming, so snapshots glide instead of snapping", () => {
    render(<OddsMovementChart {...baseProps} isReplayStreamMode replayIntervalMs={1000} />);

    for (const area of screen.getAllByTestId("price-area")) {
      expect(area).toHaveAttribute("data-animation-active", "true");
    }
  });

  it("moves the capture cursor directly to the latest structured point", () => {
    render(<OddsMovementChart {...baseProps} chartData={[
      chartPoint({ id: "first", timelineX: 100, home: 1.9 }),
      chartPoint({ id: "second", timelineX: 250, home: 1.8 }),
    ]} />);

    expect(screen.getByTestId("capture-cursor")).toHaveAttribute("data-x", "250");
  });

  it("announces replay position against the historical snapshot count", () => {
    render(
      <OddsMovementChart
        {...baseProps}
        chartData={[
          chartPoint({ id: "snapshot-1", timelineX: 1_700_000_000_000 }),
          chartPoint({ id: "snapshot-2", timelineX: 1_700_000_060_000 }),
        ]}
        isReplayStreamMode
        streamProgressPercent={67}
        replayCursor={2}
        replayTotal={3}
        replayStatus="playing"
        replayOriginalTimestamp="2023-11-14T22:14:20Z"
        replayIntervalMs={1000}
      />
    );

    expect(screen.getByRole("status", { name: /replay position/i })).toHaveTextContent(
      /Snapshot 2 of 3.*Historical/i
    );
  });

  it("stacks the progress label below the rail on narrow viewports", () => {
    render(<OddsMovementChart {...baseProps} />);

    const progressLabel = screen.getByText(/snapshots in view/i);
    expect(progressLabel.parentElement).toHaveClass("max-sm:flex-col", "max-sm:items-stretch");
    expect(progressLabel.previousElementSibling).toHaveClass("max-sm:w-full", "max-sm:flex-none");
    expect(progressLabel).not.toHaveClass("shrink-0");
    expect(progressLabel).toHaveClass("max-sm:text-right");
  });

  it("does not present a synthetic timeline coordinate as a real capture time", () => {
    render(
      <OddsMovementChart
        {...baseProps}
        chartData={[
          chartPoint({ id: "real", timelineX: 1_700_000_000_000, hasRealTimestamp: true, rawTimestamp: "2023-11-14T22:13:20Z" }),
          chartPoint({ id: "missing", timelineX: 1_700_000_000_001 }),
        ]}
      />
    );

    expect(screen.getByTestId("historical-x-axis")).toHaveAttribute("data-missing-time-label", "Time unavailable");
    expect(screen.getByRole("img", { name: /odds movement/i })).toHaveAccessibleDescription(/unavailable captures use sequence order/i);
  });

  it("does not claim the current capture is the historical end during an incomplete replay", () => {
    render(
      <OddsMovementChart
        {...baseProps}
        chartData={[chartPoint({ hasRealTimestamp: true, rawTimestamp: "2023-11-14T22:13:20Z" })]}
        isReplayStreamMode
        replayCursor={1}
        replayTotal={3}
        replayStatus="playing"
        replayIntervalMs={1000}
        streamProgressPercent={33}
      />
    );

    expect(screen.getByText("End").parentElement).toHaveTextContent(/Capture time unavailable/i);
  });

  it("keeps the selected-fixture context when no snapshots exist", () => {
    render(<OddsMovementChart {...baseProps} chartData={[]} />);
    expect(screen.getByText(/no TxLINE snapshots for Norway vs England yet/i)).toBeInTheDocument();
  });

  it("does not promise a future update when finished history is unavailable", () => {
    render(
      <OddsMovementChart
        {...baseProps}
        selectedMatch={{ ...selectedMatch, status: "finished", homeScore: 1, awayScore: 2 }}
        chartData={[]}
      />
    );

    expect(screen.getByText(/No historical TxLINE odds were available for this finished fixture/i)).toBeInTheDocument();
    expect(screen.queryByText(/next real update arrives/i)).not.toBeInTheDocument();
  });
});
