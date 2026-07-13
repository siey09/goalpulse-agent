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
    <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface-1/95 px-3 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between">
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
        <div className="min-w-0">
          <p className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 sm:block">GoalPulse / live intelligence</p>
          <h1 className="truncate font-display text-base font-bold tracking-tight text-white sm:text-lg">{title}</h1>
        </div>
      </div>
      <div role="status" aria-label="System status" className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 lg:justify-end">
        <span className={isRunning ? "rounded-full animate-glow-pulse" : ""}>
          <StatusBadge label={agentStatus} tone={AGENT_STATUS_TONE[agentStatus]} withDot />
        </span>
        <StatusBadge label={feedMode} tone={feedMode === "LIVE TxLINE" ? "accent" : "info"} />
        {freshnessLabel && <StatusBadge label={freshnessLabel} tone="neutral" />}
        {lastDecisionLabel && <StatusBadge label={lastDecisionLabel} tone="neutral" />}
      </div>
    </header>
  );
}
