export type LiveMarketsFreshnessState = "waiting" | "replay" | "live" | "stale" | "reconnecting";

export const FRESHNESS_COPY: Record<LiveMarketsFreshnessState, { label: string; toneClass: string }> = {
  waiting: { label: "Waiting", toneClass: "border-border bg-black/30 text-stone-400" },
  replay: { label: "Replay", toneClass: "border-info/30 bg-info/10 text-info-200" },
  live: { label: "Live", toneClass: "border-positive/30 bg-positive/10 text-positive-200" },
  stale: { label: "Stale", toneClass: "border-warning/30 bg-warning/10 text-warning-200" },
  reconnecting: { label: "Reconnecting", toneClass: "border-danger/30 bg-danger/10 text-danger-200" },
};

/**
 * Honest 5-way read of what the workspace is currently showing - shared by
 * the SelectedMatchPanel header (mode + freshness live there per the
 * command-header brief) and the odds chart (which keeps only its own
 * market-phase label to avoid repeating the same state twice).
 */
export function getFreshnessState(
  hasData: boolean,
  isReplayStreamMode: boolean,
  isOddsStreamLive: boolean,
  oddsStreamLastUpdate?: string
): LiveMarketsFreshnessState {
  if (!hasData) return "waiting";
  if (isReplayStreamMode) return "replay";
  if (isOddsStreamLive) return "live";
  return oddsStreamLastUpdate ? "stale" : "reconnecting";
}
