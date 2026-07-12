import { Menu } from "lucide-react";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";

export type AgentStatus = "RUNNING" | "DEGRADED" | "RECONNECTING" | "STOPPED";
export type FeedMode = "LIVE TxLINE" | "HISTORICAL TxLINE REPLAY";

const AGENT_STATUS_TONE: Record<AgentStatus, StatusTone> = {
  RUNNING: "positive",
  DEGRADED: "warning",
  RECONNECTING: "warning",
  STOPPED: "danger",
};

export interface TopStatusBarProps {
  title: string;
  agentStatus: AgentStatus;
  feedMode: FeedMode;
  /** Human-readable freshness, e.g. "2.4s ago" - caller formats, this component just displays. */
  freshnessLabel?: string;
  lastDecisionLabel?: string;
  /** Shows a hamburger button (mobile only, <768px) that opens the nav sheet. */
  onOpenMobileNav?: () => void;
}

/**
 * Sticky top status strip showing live agent status, feed mode, and
 * freshness - driven by the Command Center page's own polling/stream
 * state.
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
        <StatusBadge label={feedMode} tone={feedMode === "LIVE TxLINE" ? "accent" : "info"} />
        {freshnessLabel && <StatusBadge label={freshnessLabel} tone="neutral" />}
        {lastDecisionLabel && <StatusBadge label={lastDecisionLabel} tone="neutral" />}
      </div>
    </div>
  );
}
