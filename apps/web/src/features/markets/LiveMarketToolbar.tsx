import { Play, Square } from "lucide-react";
import { FRESHNESS_COPY, getFreshnessState } from "./freshness";

export interface LiveMarketToolbarProps {
  hasChartData: boolean;
  isReplayStreamMode: boolean;
  onToggleReplayStreamMode: () => void;
  isOddsStreamLive: boolean;
  oddsStreamLastUpdate?: string;
  replayStreamProgress?: string;
  hasDroppedUpdate: boolean;
}

export function LiveMarketToolbar({
  hasChartData,
  isReplayStreamMode,
  onToggleReplayStreamMode,
  isOddsStreamLive,
  oddsStreamLastUpdate,
  replayStreamProgress,
  hasDroppedUpdate,
}: LiveMarketToolbarProps) {
  const freshnessState = getFreshnessState(hasChartData, isReplayStreamMode, isOddsStreamLive, oddsStreamLastUpdate);
  const freshness = FRESHNESS_COPY[freshnessState];
  const ReplayIcon = isReplayStreamMode ? Square : Play;

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
        {oddsStreamLastUpdate && <span className="font-mono text-xs text-stone-400">Last tick {oddsStreamLastUpdate}</span>}
        {isReplayStreamMode && replayStreamProgress && <span className="font-mono text-xs text-info-200">{replayStreamProgress}</span>}
        <button
          type="button"
          onClick={onToggleReplayStreamMode}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-black/20 px-3 text-xs font-semibold text-stone-200 transition-colors hover:border-accent/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <ReplayIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {isReplayStreamMode ? "Stop demo replay" : "Start demo replay"}
        </button>
      </div>

      {hasDroppedUpdate && (
        <p role="status" className="basis-full text-xs text-warning-200 lg:order-3">
          One update was skipped because it could not be parsed. Prior data remains visible.
        </p>
      )}
    </header>
  );
}
