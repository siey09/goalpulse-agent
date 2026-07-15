import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveMarketToolbar, type LiveMarketToolbarProps } from "./LiveMarketToolbar";

const baseToolbarProps: LiveMarketToolbarProps = {
  hasChartData: true,
  isReplayStreamMode: false,
  replayStatus: "live",
  replaySpeed: 1,
  replayProgressLabel: "Live feed",
  onPlayReplay: vi.fn(),
  onPauseReplay: vi.fn(),
  onRestartReplay: vi.fn(),
  onExitReplay: vi.fn(),
  onChangeReplaySpeed: vi.fn(),
  isOddsStreamLive: false,
  oddsStreamLastUpdate: undefined,
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
    const onPlayReplay = vi.fn();
    render(<LiveMarketToolbar {...baseToolbarProps} hasDroppedUpdate onPlayReplay={onPlayReplay} />);

    expect(screen.getByText(/one update was skipped/i)).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: /^play replay$/i }));
    expect(onPlayReplay).toHaveBeenCalledOnce();
  });

  it.each([
    ["playing", "Pause replay", "onPauseReplay"],
    ["paused", "Resume replay", "onPlayReplay"],
  ] as const)("offers the one primary action for %s playback", (replayStatus, action, callback) => {
    const callbacks = {
      onPlayReplay: vi.fn(),
      onPauseReplay: vi.fn(),
    };
    render(<LiveMarketToolbar {...baseToolbarProps} {...callbacks} isReplayStreamMode replayStatus={replayStatus} />);

    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(callbacks[callback]).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: replayStatus === "playing" ? /resume replay/i : /pause replay/i })).not.toBeInTheDocument();
  });

  it("offers restart and live-feed escape while replay is active", () => {
    const onRestartReplay = vi.fn();
    const onExitReplay = vi.fn();
    render(
      <LiveMarketToolbar
        {...baseToolbarProps}
        isReplayStreamMode
        replayStatus="complete"
        replayProgressLabel="Replay complete · 10 real snapshots"
        onRestartReplay={onRestartReplay}
        onExitReplay={onExitReplay}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /restart replay/i }));
    fireEvent.click(screen.getByRole("button", { name: /live feed/i }));
    expect(onRestartReplay).toHaveBeenCalledOnce();
    expect(onExitReplay).toHaveBeenCalledOnce();
    expect(screen.getByRole("status", { name: /replay state/i })).toHaveTextContent("Replay complete · 10 real snapshots");
    expect(screen.getByRole("status", { name: /replay state/i })).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("group", { name: /replay controls/i })).toBeInTheDocument();
  });

  it.each([0.5, 1, 2] as const)("changes replay speed to %sx", (speed) => {
    const onChangeReplaySpeed = vi.fn();
    render(<LiveMarketToolbar {...baseToolbarProps} isReplayStreamMode replayStatus="paused" onChangeReplaySpeed={onChangeReplaySpeed} />);

    fireEvent.change(screen.getByRole("combobox", { name: /replay speed/i }), { target: { value: String(speed) } });
    expect(onChangeReplaySpeed).toHaveBeenCalledWith(speed);
  });

  it("labels the latest timestamp as a feed update", () => {
    render(<LiveMarketToolbar {...baseToolbarProps} oddsStreamLastUpdate="11:12 PM" />);
    expect(screen.getByText(/Last feed update 11:12 PM/i)).toBeInTheDocument();
  });

  it("disables replay with an accessible explanation until two real snapshots are known", () => {
    render(<LiveMarketToolbar {...baseToolbarProps} replaySnapshotCount={1} />);

    expect(screen.getByRole("button", { name: /^play replay$/i })).toBeDisabled();
    expect(screen.getByText(/replay needs at least two real TxLINE snapshots/i)).toBeInTheDocument();
  });

  it("shows a nonblocking paused notice with recovery actions after connection failure", () => {
    render(
      <LiveMarketToolbar
        {...baseToolbarProps}
        replayStatus="paused"
        replaySnapshotCount={4}
        replayConnectionFailed
      />
    );

    expect(screen.getByRole("status", { name: /replay connection/i })).toHaveTextContent(/paused at the last confirmed snapshot/i);
    expect(screen.getByRole("button", { name: /resume replay/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart replay/i })).toBeEnabled();
  });
});
