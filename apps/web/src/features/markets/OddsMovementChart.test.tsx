import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Match } from "../../types";
import { OddsMovementChart, type OddsMovementChartProps } from "./OddsMovementChart";
import type { LiveMarketsChartMarker } from "./LiveMarketsPage";

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
  x: "S1",
  y: 1.85,
  label: "Sharp move",
  target: "Norway",
  severity: "HIGH",
  oddsChangePct: -7.5,
};

const baseProps: OddsMovementChartProps = {
  selectedMatch,
  chartData: [
    {
      name: "S1",
      home: 1.9,
      draw: 3.4,
      away: 4.1,
      snapshotLabel: "TxLINE snapshot 1",
      timelineLabel: "Captured at 11:10 PM",
    },
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
      <OddsMovementChart {...baseProps} chartData={[{ name: "S1", home: 1.9, draw: 3.4, away: 4.1 }]} />
    );
    expect(screen.getByRole("columnheader", { name: "Draw odds" })).toBeInTheDocument();

    rerender(<OddsMovementChart {...baseProps} chartData={[{ name: "S1", home: 1.9, away: 4.1 }]} />);
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
    const repeatedPoint = { name: "S1", home: 1.9, away: 4.1, timelineLabel: "Captured now" };

    render(<OddsMovementChart {...baseProps} chartData={[repeatedPoint, repeatedPoint]} />);

    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key/i);
    consoleError.mockRestore();
  });

  it("names the chart and explains snapshot semantics", () => {
    render(<OddsMovementChart {...baseProps} />);
    expect(screen.getByRole("img", { name: /odds movement for Norway vs England/i })).toHaveAccessibleDescription(/TxLINE snapshot/i);
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
