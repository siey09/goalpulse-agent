import { Pause, Play, Radio, RotateCcw } from "lucide-react";
import { FRESHNESS_COPY, getFreshnessState } from "./freshness";
import type { ReplaySpeed, ReplayStatus } from "./replayState";

export interface LiveMarketToolbarProps {
  hasChartData: boolean;
  isReplayStreamMode: boolean;
  replayStatus: ReplayStatus;
  replaySpeed: ReplaySpeed;
  replayProgressLabel: string;
  onPlayReplay: () => void;
  onPauseReplay: () => void;
  onRestartReplay: () => void;
  onExitReplay: () => void;
  onChangeReplaySpeed: (speed: ReplaySpeed) => void;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
  hasDroppedUpdate: boolean;
}

export function LiveMarketToolbar({
  hasChartData,
  isReplayStreamMode,
  replayStatus,
  replaySpeed,
  replayProgressLabel,
  onPlayReplay,
  onPauseReplay,
  onRestartReplay,
  onExitReplay,
  onChangeReplaySpeed,
  isOddsStreamLive,
  oddsStreamLastUpdate,
  hasDroppedUpdate,
}: LiveMarketToolbarProps) {
  const freshnessState = getFreshnessState(hasChartData, isReplayStreamMode, isOddsStreamLive, oddsStreamLastUpdate);
  const freshness = FRESHNESS_COPY[freshnessState];
  const primaryAction = replayStatus === "live"
    ? { label: "Play replay", icon: Play, onClick: onPlayReplay }
    : replayStatus === "playing"
      ? { label: "Pause replay", icon: Pause, onClick: onPauseReplay }
      : replayStatus === "paused"
        ? { label: "Resume replay", icon: Play, onClick: onPlayReplay }
        : undefined;
  const PrimaryIcon = primaryAction?.icon;

  return (
    <header className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-info-200">Operations / market feed</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">Live Markets</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-400">
          Select a fixture, inspect real TxLINE movement, and open the evidence behind a signal.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          role="status"
          aria-label={`Feed state: ${freshness.label}`}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs font-semibold ${freshness.toneClass}`}
        >
          {freshnessState === "live" && <span className="h-1.5 w-1.5 rounded-full bg-positive motion-safe:animate-pulse" aria-hidden="true" />}
          {freshness.label}
        </span>
        {oddsStreamLastUpdate && <span className="font-mono text-xs text-stone-400">Last feed update {oddsStreamLastUpdate}</span>}
        <span role="status" aria-label="Replay state" aria-live="polite" className="font-mono text-xs text-info-200">
          {replayProgressLabel}
        </span>
        <div aria-label="Replay controls" className="flex flex-wrap items-center gap-2">
          {primaryAction && PrimaryIcon && (
            <button type="button" onClick={primaryAction.onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-semibold text-accent-100 transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              <PrimaryIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {primaryAction.label}
            </button>
          )}
          {isReplayStreamMode && (
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
      </div>

      {hasDroppedUpdate && (
        <p role="status" className="basis-full text-xs text-warning-200 lg:order-3">
          One update was skipped because it could not be parsed. Prior data remains visible.
        </p>
      )}
    </header>
  );
}
