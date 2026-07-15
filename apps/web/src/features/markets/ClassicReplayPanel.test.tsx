import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassicReplayPanel } from "./ClassicReplayPanel";

describe("ClassicReplayPanel", () => {
  it("uses the same controlled replay semantics without legacy demo controls", () => {
    const onPauseReplay = vi.fn();
    render(
      <ClassicReplayPanel
        snapshotCount={4}
        replayStatus="playing"
        replaySpeed={1}
        replayProgressLabel="Snapshot 4 of 10"
        isOddsStreamLive={false}
        oddsStreamLastUpdate="11:12 PM"
        onPlayReplay={vi.fn()}
        onPauseReplay={onPauseReplay}
        onRestartReplay={vi.fn()}
        onExitReplay={vi.fn()}
        onChangeReplaySpeed={vi.fn()}
      />
    );

    const controls = screen.getByRole("group", { name: /replay controls/i });
    fireEvent.click(within(controls).getByRole("button", { name: /pause replay/i }));
    expect(onPauseReplay).toHaveBeenCalledOnce();
    expect(screen.getByText(/Last feed update 11:12 PM/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo replay stream|last tick|start demo replay|stop demo replay/i)).not.toBeInTheDocument();
  });
});
