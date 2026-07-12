import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type { Health } from "../../types";

export interface SystemHealthPageProps {
  health: Health | null;
}

/**
 * Deliberately minimal - composes only the health data App.tsx already
 * fetches (health.liveStream), no new metrics invented. A more complete
 * System Health destination (fixture coverage, cycle-gap detection, the
 * feed-health endpoint) is a real future option, not built here.
 */
export function SystemHealthPage({ health }: SystemHealthPageProps) {
  const connected = health?.liveStream?.connected ?? false;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader eyebrow="Live status" title="TxLINE Push Feed" />
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={connected ? "Connected" : "Reconnecting"} tone={connected ? "positive" : "warning"} withDot />
          <span className="text-xs text-stone-400">
            {health?.liveStream?.totalEventsReceived ?? 0} events received
            {health?.liveStream?.totalReconnects ? ` · ${health.liveStream.totalReconnects} reconnect(s)` : ""}
          </span>
        </div>
        {health?.liveStream?.lastError && (
          <p className="mt-2 text-xs text-danger">{health.liveStream.lastError}</p>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader eyebrow="Backend" title="Agent Status" />
        <StatusBadge label={health?.ok ? "Online" : "Checking"} tone={health?.ok ? "positive" : "neutral"} withDot />
        {health?.useSimulatedFeed !== undefined && (
          <p className="mt-2 text-xs text-stone-400">
            Feed mode: {health.useSimulatedFeed ? "Sandbox (simulated)" : "Real TxLINE"}
          </p>
        )}
      </Card>

      <Card className="p-4">
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
