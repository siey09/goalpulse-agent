import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Match } from "../../types";
import { SelectedMarketWorkspace, type SelectedMarketWorkspaceProps } from "./SelectedMarketWorkspace";

const selectedMatch: Match = {
  id: "m1",
  homeTeam: "Norway",
  awayTeam: "England",
  status: "live",
  minute: 67,
  homeScore: 1,
  awayScore: 0,
};

const baseProps: SelectedMarketWorkspaceProps = {
  selectedMatch,
  chartData: [
    { id: "s1", name: "S1", timelineX: 0, hasRealTimestamp: false, rawTimestamp: "", snapshotLabel: "TxLINE snapshot 1", timelineLabel: "Capture time unavailable", home: 1.9, draw: 3.5, away: 4.1 },
    { id: "s2", name: "S2", timelineX: 1, hasRealTimestamp: false, rawTimestamp: "", snapshotLabel: "TxLINE snapshot 2", timelineLabel: "Capture time unavailable", home: 1.85, draw: 3.4, away: 4.2 },
  ],
  chartReadout: {
    homeCurrent: "1.85",
    drawCurrent: "3.40",
    awayCurrent: "4.20",
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
  selectedMatchMarketPressure: { homePressure: 62, awayPressure: 38, leader: "Norway", hasData: true },
  isReplayStreamMode: false,
};

describe("SelectedMarketWorkspace", () => {
  it("renders price cells without React key-spread warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<SelectedMarketWorkspace {...baseProps} />);

    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/props object containing a "key" prop/i);
    consoleError.mockRestore();
  });

  it("connects fixture identity, score, H/D/A prices, and verdict", () => {
    render(<SelectedMarketWorkspace {...baseProps} />);

    const workspace = screen.getByRole("region", { name: /selected market/i });
    expect(within(workspace).getByText("Norway vs England")).toBeInTheDocument();
    expect(within(workspace).getByLabelText(/score/i)).toHaveTextContent("1–0");
    expect(within(workspace).getByText("1.85")).toBeInTheDocument();
    expect(within(workspace).getByText("3.40")).toBeInTheDocument();
    expect(within(workspace).getByText("4.20")).toBeInTheDocument();
    expect(within(workspace).getByText("Market steady")).toBeInTheDocument();
  });

  it("pulses the price readout during replay but stays static during live polling", () => {
    const { rerender } = render(<SelectedMarketWorkspace {...baseProps} isReplayStreamMode={false} />);
    expect(screen.getByText("1.85")).not.toHaveClass("price-tick-pulse");

    rerender(<SelectedMarketWorkspace {...baseProps} isReplayStreamMode />);
    expect(screen.getByText("1.85")).toHaveClass("price-tick-pulse");
  });

  it("does not invent pressure when no selected-match signal exists", () => {
    render(
      <SelectedMarketWorkspace
        {...baseProps}
        selectedMatchMarketPressure={{ homePressure: 0, awayPressure: 0, leader: "Balanced", hasData: false }}
      />
    );

    expect(screen.getByText(/waiting for a selected-match signal/i)).toBeInTheDocument();
    expect(screen.queryByText(/0% pressure/i)).not.toBeInTheDocument();
  });
});
