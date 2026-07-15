import { FRESHNESS_COPY, getFreshnessState } from "./freshness";
import { ReplayControls } from "./ReplayControls";
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
        <ReplayControls
          replayStatus={replayStatus}
          replaySpeed={replaySpeed}
          onPlayReplay={onPlayReplay}
          onPauseReplay={onPauseReplay}
          onRestartReplay={onRestartReplay}
          onExitReplay={onExitReplay}
          onChangeReplaySpeed={onChangeReplaySpeed}
        />
      </div>

      {hasDroppedUpdate && (
        <p role="status" className="basis-full text-xs text-warning-200 lg:order-3">
          One update was skipped because it could not be parsed. Prior data remains visible.
        </p>
      )}
    </header>
  );
}
