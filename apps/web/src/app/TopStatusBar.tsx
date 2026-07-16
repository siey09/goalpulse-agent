import { Menu, MessageCircle } from "lucide-react";
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
  /** Destination pages with their own h1 opt into non-heading title text. */
  titleAs?: "h1" | "p";
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
  titleAs = "h1",
  agentStatus,
  feedMode,
  freshnessLabel,
  lastDecisionLabel,
  onOpenMobileNav,
}: TopStatusBarProps) {
  const isRunning = agentStatus === "RUNNING";
  const TitleElement = titleAs;

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
          <TitleElement className="truncate font-display text-base font-bold tracking-tight text-white sm:text-lg">
            {title}
          </TitleElement>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 lg:justify-end">
        <div role="status" aria-label="System status" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 lg:flex-none lg:justify-end">
          <span className={isRunning ? "rounded-full animate-glow-pulse" : ""}>
            <StatusBadge label={agentStatus} tone={AGENT_STATUS_TONE[agentStatus]} withDot />
          </span>
          <StatusBadge label={feedMode} tone={feedMode === "LIVE TxLINE" ? "accent" : "info"} />
          {freshnessLabel && <StatusBadge label={freshnessLabel} tone="neutral" />}
          {lastDecisionLabel && <StatusBadge label={lastDecisionLabel} tone="neutral" />}
        </div>
        <a
          href="https://discord.gg/vCsA8Wuwh"
          target="_blank"
          rel="noreferrer"
          aria-label="Join GoalPulse Discord community (opens in a new tab)"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-proof/25 bg-proof/10 px-3 text-xs font-semibold text-proof-100 transition-colors hover:border-proof/45 hover:bg-proof/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-proof/70 motion-reduce:transition-none"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span>Join community</span>
        </a>
      </div>
    </header>
  );
}
