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
}

/**
 * Sticky top status strip. Presentational only in Phase 1 - not wired to
 * real polling/stream state yet; that happens once Phase 2 composes this
 * into the actual Command Center page.
 */
export function TopStatusBar({
  title,
  agentStatus,
  feedMode,
  freshnessLabel,
  lastDecisionLabel,
}: TopStatusBarProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-1/95 px-6 py-3 backdrop-blur">
      <h1 className="text-lg font-bold text-white">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={agentStatus} tone={AGENT_STATUS_TONE[agentStatus]} withDot />
        <StatusBadge label={feedMode} tone={feedMode === "LIVE TxLINE" ? "accent" : "info"} />
        {freshnessLabel && <StatusBadge label={freshnessLabel} tone="neutral" />}
        {lastDecisionLabel && <StatusBadge label={lastDecisionLabel} tone="neutral" />}
      </div>
    </div>
  );
}
