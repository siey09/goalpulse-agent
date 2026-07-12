import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusCapsule } from "../../components/ui/widgets/StatusCapsule";
import { dataFreshnessLabel } from "../../lib/formatters";
import type { FeedHealth, Health } from "../../types";

export interface SystemHealthPageProps {
  health: Health | null;
  feedHealth: FeedHealth | null;
}

const STATUS_TONE: Record<"healthy" | "degraded" | "down", StatusTone> = {
  healthy: "positive",
  degraded: "warning",
  down: "danger",
};

const STATUS_LABEL: Record<"healthy" | "degraded" | "down", string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

/** staleForMs is already a computed duration from the backend, not a timestamp - dataFreshnessLabel takes an ISO string, so this formats the raw ms directly instead of round-tripping through a fake date. */
function formatDurationMs(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

/**
 * Built around real operational hierarchy: a primary live-status section
 * driven by /api/feed-health's already-computed cycle/odds/coverage
 * checks (see apps/api/src/logic/feedHealth.ts - nothing here is invented
 * on the frontend), visually heavier than the secondary threshold
 * glossary below it, which is static reference copy that never changes.
 */
export function SystemHealthPage({ health, feedHealth }: SystemHealthPageProps) {
  const connected = health?.liveStream?.connected ?? false;
  const status = feedHealth?.status;
  const cycleHealth = feedHealth?.cycleHealth;
  const oddsFreshness = feedHealth?.oddsFreshness;
  const fixtureCoverage = feedHealth?.fixtureCoverage;
  const staleMatches = oddsFreshness?.staleLiveMatches ?? [];

  if (!health) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <SectionHeader eyebrow="Live status" title="System Health" />
          <EmptyState reason="Waiting for the first health check to complete." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader
          eyebrow="Live status"
          title="System Health"
          action={status && <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} withDot />}
        />

        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white">TxLINE push feed</h3>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={connected ? "Connected" : "Reconnecting"} tone={connected ? "positive" : "warning"} withDot />
              <span className="text-xs text-stone-400">
                {health.liveStream?.totalEventsReceived ?? 0} events received
                {health.liveStream?.totalReconnects ? ` · ${health.liveStream.totalReconnects} reconnect(s)` : ""}
              </span>
            </div>
            {health.liveStream?.lastError && <p className="text-xs text-danger">{health.liveStream.lastError}</p>}
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white">Backend</h3>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={health.ok ? "Online" : "Checking"} tone={health.ok ? "positive" : "neutral"} withDot />
              {health.useSimulatedFeed !== undefined && (
                <span className="text-xs text-stone-400">
                  Feed mode: {health.useSimulatedFeed ? "Sandbox (simulated)" : "Real TxLINE"}
                </span>
              )}
            </div>
          </div>
        </div>

        {!feedHealth ? (
          <div className="mt-4">
            <EmptyState reason="Feed-health metrics (cycle health, odds freshness, fixture coverage) are not available yet — showing basic connectivity only." />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-black/20 p-3">
              <h3 className="mb-2 text-xs font-semibold text-white">Agent cycle</h3>
              <div className="flex flex-wrap gap-2">
                <StatusCapsule
                  label="Last run"
                  value={cycleHealth?.lastRunAt ? (dataFreshnessLabel(cycleHealth.lastRunAt) ?? "just now") : "No runs yet"}
                  tone={cycleHealth?.isCurrentGapExceeded ? "danger" : "neutral"}
                />
                <StatusCapsule
                  label="Expected interval"
                  value={cycleHealth?.expectedIntervalMs ? `${Math.round(cycleHealth.expectedIntervalMs / 1000)}s` : "—"}
                  tone="neutral"
                />
                <StatusCapsule
                  label="Missed cycles"
                  value={cycleHealth?.recentMissedCycles ?? 0}
                  tone={cycleHealth?.recentMissedCycles ? "warning" : "positive"}
                />
              </div>
            </div>

            <div className="rounded-xl bg-black/20 p-3">
              <h3 className="mb-2 text-xs font-semibold text-white">Odds freshness</h3>
              <div className="flex flex-wrap gap-2">
                <StatusCapsule
                  label="Stale live matches"
                  value={oddsFreshness?.staleLiveMatchCount ?? 0}
                  tone={oddsFreshness?.staleLiveMatchCount ? "warning" : "positive"}
                />
              </div>
              {staleMatches.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {staleMatches.map((match) => (
                    <li key={match.matchId ?? match.match} className="text-[11px] text-stone-400">
                      {match.match ?? "Unknown match"} — stale for {formatDurationMs(match.staleForMs ?? 0)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-stone-500">No stale live matches.</p>
              )}
            </div>

            <div className="rounded-xl bg-black/20 p-3 md:col-span-2">
              <h3 className="mb-2 text-xs font-semibold text-white">Fixture coverage</h3>
              <div className="flex flex-wrap items-center gap-3">
                <StatusCapsule
                  label="Raw fixtures"
                  value={fixtureCoverage?.lastRunRawFixtureCount ?? "—"}
                  tone="neutral"
                />
                <StatusCapsule
                  label="Processed"
                  value={fixtureCoverage?.lastRunProcessedCount ?? "—"}
                  tone="neutral"
                />
                <StatusCapsule
                  label="Recent coverage drops"
                  value={fixtureCoverage?.recentCoverageDrops ?? 0}
                  tone={fixtureCoverage?.isCoverageDropped ? "danger" : "positive"}
                />
              </div>
              <p className="mt-2 text-[11px] text-stone-500">
                {fixtureCoverage?.isCoverageDropped
                  ? "The most recent run processed fewer fixtures than TxLINE reported."
                  : "The most recent run processed every fixture TxLINE reported."}
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card className="border-border/60 bg-surface-1/60 p-4">
        <SectionHeader eyebrow="Detection rules" title="Signal Thresholds" />
        <div className="space-y-2">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-100">WATCH</span>
              <span className="text-accent-200">≥ 4%</span>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">
              Early movement detected, but not yet strong enough for a major alert.
            </p>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-100">MOMENTUM SHIFT</span>
              <span className="text-accent-200">≥ 8%</span>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">
              Odds compression suggests meaningful market pressure.
            </p>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-100">SHARP MOVE</span>
              <span className="text-accent-200">≥ 15%</span>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">
              High-severity movement that the agent flags for review.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
