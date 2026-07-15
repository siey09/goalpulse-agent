import { Pause, Play, Radio, RotateCcw } from "lucide-react";
import type { ReplaySpeed, ReplayStatus } from "./replayState";

export interface ReplayControlsProps {
  replayStatus: ReplayStatus;
  replaySpeed: ReplaySpeed;
  onPlayReplay: () => void;
  onPauseReplay: () => void;
  onRestartReplay: () => void;
  onExitReplay: () => void;
  onChangeReplaySpeed: (speed: ReplaySpeed) => void;
}

export function ReplayControls({
  replayStatus,
  replaySpeed,
  onPlayReplay,
  onPauseReplay,
  onRestartReplay,
  onExitReplay,
  onChangeReplaySpeed,
}: ReplayControlsProps) {
  const isReplayActive = replayStatus !== "live";
  const primaryAction = replayStatus === "live"
    ? { label: "Play replay", icon: Play, onClick: onPlayReplay }
    : replayStatus === "playing"
      ? { label: "Pause replay", icon: Pause, onClick: onPauseReplay }
      : replayStatus === "paused"
        ? { label: "Resume replay", icon: Play, onClick: onPlayReplay }
        : undefined;
  const PrimaryIcon = primaryAction?.icon;

  return (
    <div role="group" aria-label="Replay controls" className="flex flex-wrap items-center gap-2">
      {primaryAction && PrimaryIcon && (
        <button type="button" onClick={primaryAction.onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-semibold text-accent-100 transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
          <PrimaryIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {primaryAction.label}
        </button>
      )}
      {isReplayActive && (
        <>
          <button type="button" onClick={onRestartReplay} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-black/20 px-3 text-xs font-semibold text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restart replay
          </button>
          <button type="button" onClick={onExitReplay} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-black/20 px-3 text-xs font-semibold text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Live feed
          </button>
          <label className="sr-only" htmlFor="replay-speed">Replay speed</label>
          <select
            id="replay-speed"
            aria-label="Replay speed"
            value={replaySpeed}
            onChange={(event) => onChangeReplaySpeed(Number(event.target.value) as ReplaySpeed)}
            className="min-h-11 rounded-lg border border-border bg-surface-1 px-3 font-mono text-xs text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </>
      )}
    </div>
  );
}
