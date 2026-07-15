import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveMarketToolbar, type LiveMarketToolbarProps } from "./LiveMarketToolbar";

const baseToolbarProps: LiveMarketToolbarProps = {
  hasChartData: true,
  isReplayStreamMode: false,
  onToggleReplayStreamMode: vi.fn(),
  isOddsStreamLive: false,
  oddsStreamLastUpdate: undefined,
  replayStreamProgress: undefined,
  hasDroppedUpdate: false,
};

describe("LiveMarketToolbar", () => {
  it.each([
    [{ hasChartData: false, isReplayStreamMode: false, isOddsStreamLive: false }, "Waiting"],
    [{ hasChartData: false, isReplayStreamMode: true, isOddsStreamLive: false }, "Replay"],
    [{ hasChartData: true, isReplayStreamMode: true, isOddsStreamLive: false }, "Replay"],
    [{ hasChartData: true, isReplayStreamMode: false, isOddsStreamLive: true }, "Live"],
    [{ hasChartData: true, isReplayStreamMode: false, isOddsStreamLive: false, oddsStreamLastUpdate: "11:12 PM" }, "Stale"],
    [{ hasChartData: true, isReplayStreamMode: false, isOddsStreamLive: false }, "Reconnecting"],
  ])("renders the truthful authoritative state", (state, label) => {
    render(<LiveMarketToolbar {...baseToolbarProps} {...state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: `Feed state: ${label}` })).toBeInTheDocument();
  });

  it("exposes replay and dropped-update actions without raw payloads", () => {
    const onToggle = vi.fn();
    render(<LiveMarketToolbar {...baseToolbarProps} hasDroppedUpdate onToggleReplayStreamMode={onToggle} />);

    expect(screen.getByText(/one update was skipped/i)).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: /start demo replay/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
