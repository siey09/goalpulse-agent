export type FreshnessState = "waiting" | "replay" | "live" | "stale" | "reconnecting";

export const FRESHNESS_COPY: Record<FreshnessState, { label: string; toneClass: string }> = {
  waiting: { label: "Waiting", toneClass: "border-border bg-black/30 text-stone-400" },
  replay: { label: "Replay", toneClass: "border-info/30 bg-info/10 text-info-200" },
  live: { label: "Live", toneClass: "border-positive/30 bg-positive/10 text-positive-200" },
  stale: { label: "Stale", toneClass: "border-warning/30 bg-warning/10 text-warning-200" },
  reconnecting: { label: "Reconnecting", toneClass: "border-danger/30 bg-danger/10 text-danger-200" },
};

/**
 * Honest 5-way read of what a single match panel is currently showing -
 * shared by the SelectedMatchPanel header (mode + freshness live there per
 * the command-header brief) and the odds chart (which keeps only its own
 * market-phase label to avoid repeating the same state twice).
 */
export function getFreshnessState(
  hasData: boolean,
  isReplayStreamMode: boolean,
  isOddsStreamLive: boolean,
  oddsStreamLastUpdate?: string
): FreshnessState {
  if (!hasData) return "waiting";
  if (isReplayStreamMode) return "replay";
  if (isOddsStreamLive) return "live";
  return oddsStreamLastUpdate ? "stale" : "reconnecting";
}

/**
 * App-wide equivalent of getFreshnessState, deliberately kept separate
 * rather than reusing it with substitute inputs: a selected match going to
 * finished/scheduled, or having no odds snapshots yet, is not evidence the
 * whole application is stale, so this never reads from a selected match's
 * oddsStreamLastUpdate. Every input here is a genuinely global signal
 * (dashboard poll health, replay mode, backend-reported feed health) - see
 * precedence order below for how they're reconciled without conflating
 * dashboard-poll freshness, backend health, and stream connectivity.
 */
export function getGlobalFreshnessState(params: {
  hasLoadedDashboardOnce: boolean;
  isReplayStreamMode: boolean;
  isSustainedDashboardPollFailure: boolean;
  isLiveStreamConnected: boolean;
  feedHealthStatus?: "healthy" | "degraded" | "down";
}): FreshnessState {
  const {
    hasLoadedDashboardOnce,
    isReplayStreamMode,
    isSustainedDashboardPollFailure,
    isLiveStreamConnected,
    feedHealthStatus,
  } = params;

  if (!hasLoadedDashboardOnce) return "waiting";
  if (isReplayStreamMode) return "replay";
  if (isSustainedDashboardPollFailure) return "reconnecting";
  if (feedHealthStatus === "down") return "reconnecting";
  if (!isLiveStreamConnected) return "reconnecting";
  if (feedHealthStatus === "degraded") return "stale";
  return "live";
}

const SUSTAINED_FAILURE_COUNT = 3;
const SUSTAINED_FAILURE_MS = 15000;

/**
 * A single failed poll is normal jitter, not an outage - only call this
 * "sustained" once either 3 consecutive polls have failed, or 15s have
 * passed with no successful refresh at all (covers a poll that's failing
 * to even fire, not just erroring).
 */
export function isSustainedPollFailure(
  consecutiveFailures: number,
  msSinceLastSuccess: number | null
): boolean {
  if (consecutiveFailures >= SUSTAINED_FAILURE_COUNT) return true;
  if (msSinceLastSuccess !== null && msSinceLastSuccess >= SUSTAINED_FAILURE_MS) return true;
  return false;
}
