import { Menu } from "lucide-react";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import { FRESHNESS_COPY, type FreshnessState } from "../lib/freshness";

export type AgentStatus = "RUNNING" | "DEGRADED" | "RECONNECTING" | "STOPPED";

const AGENT_STATUS_TONE: Record<AgentStatus, StatusTone> = {
  RUNNING: "positive",
  DEGRADED: "warning",
  RECONNECTING: "warning",
  STOPPED: "danger",
};

const FRESHNESS_TONE: Record<FreshnessState, StatusTone> = {
  waiting: "neutral",
  replay: "info",
  live: "accent",
  stale: "warning",
  reconnecting: "danger",
};

export interface TopStatusBarProps {
  title: string;
  agentStatus: AgentStatus;
  /** App-wide freshness (dashboard poll health + replay mode + backend feed health) - never derived from a single selected match. */
  feedMode: FreshnessState;
  /** Human-readable freshness, e.g. "2.4s ago" - caller formats, this component just displays. */
  freshnessLabel?: string;
  lastDecisionLabel?: string;
  /** Shows a hamburger button (mobile only, <768px) that opens the nav sheet. */
  onOpenMobileNav?: () => void;
}

/**
 * Sticky top status strip showing live agent status, feed mode, and
 * freshness - driven by the Command Center page's own polling/stream
 * state. feedMode reuses the same FreshnessState vocabulary as Live
 * Markets' per-match freshness pill, but is computed from app-wide
 * sources only (see App.tsx's getGlobalFreshnessState call site) so a
 * single finished/scheduled selected match never makes the whole app
 * read as stale or waiting.
 */
export function TopStatusBar({
  title,
  agentStatus,
  feedMode,
  freshnessLabel,
  lastDecisionLabel,
  onOpenMobileNav,
}: TopStatusBarProps) {
  const isRunning = agentStatus === "RUNNING";
  const freshness = FRESHNESS_COPY[feedMode];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-1/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/8 text-stone-300 transition hover:bg-white/12 hover:text-white md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="font-display text-lg font-bold tracking-tight text-white">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={isRunning ? "rounded-full animate-glow-pulse" : ""}>
          <StatusBadge label={agentStatus} tone={AGENT_STATUS_TONE[agentStatus]} withDot />
        </span>
        <span className={feedMode === "live" ? "rounded-full animate-glow-pulse" : ""}>
          <StatusBadge label={freshness.label} tone={FRESHNESS_TONE[feedMode]} withDot={feedMode === "live"} />
        </span>
        {freshnessLabel && <StatusBadge label={freshnessLabel} tone="neutral" />}
        {lastDecisionLabel && <StatusBadge label={lastDecisionLabel} tone="neutral" />}
      </div>
    </div>
  );
}
