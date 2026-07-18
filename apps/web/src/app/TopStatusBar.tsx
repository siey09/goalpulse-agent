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
 * Minimal Discord "Clyde" mark. lucide-react only ships generic icons,
 * no brand glyphs, so this is inlined directly (path data from the
 * CC0-licensed Simple Icons set) rather than pulling in a whole
 * brand-icon package for one glyph.
 */
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
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
    <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-gradient-to-r from-surface-1/95 via-surface-1/95 to-surface-1/80 px-3 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between">
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
          <p className="hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 sm:flex">
            <span className="h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            GoalPulse / live intelligence
          </p>
          <TitleElement className="truncate font-display text-base font-bold tracking-tight text-white sm:text-lg">
            {title}
          </TitleElement>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 lg:justify-end">
        <div
          role="status"
          aria-label="System status"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-full border border-border/60 bg-black/20 px-2 py-1.5 lg:flex-none lg:justify-end"
        >
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
          <DiscordIcon className="h-4 w-4" />
          <span>Join community</span>
        </a>
      </div>
    </header>
  );
}
