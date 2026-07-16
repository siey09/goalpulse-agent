import type { DestinationId } from "./navigation";

export interface GuideStep {
  title: string;
  detail: string;
  destination: DestinationId;
  targetId?: string;
  targetText?: string;
  requiresReplayBacktest?: boolean;
}

/** A concise judge path through GoalPulse's strongest working evidence. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Start with the operating picture",
    detail: "See live fixture coverage, the latest decision, market movement, and system state in one operator view.",
    destination: "command-center",
    targetId: "guide-command-center-overview",
  },
  {
    title: "Choose a market",
    detail: "Select a live, upcoming, or finished fixture. The workspace updates without losing the tournament context.",
    destination: "live-markets",
    targetId: "guide-market-board",
  },
  {
    title: "Read the selected match",
    detail: "Connect the exact score and status to the current Home, Draw, and Away prices before interpreting pressure.",
    destination: "live-markets",
    targetId: "guide-selected-match",
  },
  {
    title: "Trace real price movement",
    detail: "Every plotted point is a captured TxLINE snapshot. Signal markers appear only when deterministic thresholds are crossed.",
    destination: "live-markets",
    targetId: "guide-odds-chart",
  },
  {
    title: "Connect price to field evidence",
    detail: "GoalPulse pairs odds movement with scores context and reliability checks so market-only pressure stays clearly labeled.",
    destination: "signals",
    targetId: "signal-intelligence",
  },
  {
    title: "Challenge the price",
    detail: "Market Maker quotes a bid/ask band around TxLINE fair odds and widens it when field pressure or data risk rises.",
    destination: "market-maker",
    targetId: "guide-market-maker",
  },
  {
    title: "Compare autonomous strategies",
    detail: "Momentum, Contrarian, and Kelly strategies consume the same evidence so their decisions can be compared fairly.",
    destination: "agent-arena",
    targetId: "guide-agent-arena",
  },
  {
    title: "Follow the decision loop",
    detail: "The feed shows how GoalPulse ingests, evaluates, and records each autonomous decision in sequence.",
    destination: "command-center",
    targetId: "guide-decision-feed",
  },
  {
    title: "Replay the same engine",
    detail: "Replay runs stored TxLINE snapshots through the production decision path for a repeatable judge demo.",
    destination: "replay-lab",
    targetId: "guide-backtest-card",
    requiresReplayBacktest: true,
  },
  {
    title: "Inspect verification depth",
    detail: "The receipt separates local audit evidence from proof that was actually checked against Solana mainnet.",
    destination: "verification",
    targetId: "guide-verification-receipt",
  },
  {
    title: "Search the permanent record",
    detail: "The archive preserves created and settled signals independently from the live dashboard's memory limits.",
    destination: "archive",
    targetId: "guide-archive-ledger",
  },
  {
    title: "Finish with operational truth",
    detail: "System Health exposes feed, cycle, archive, and stream evidence instead of hiding degraded dependencies.",
    destination: "system-health",
    targetId: "guide-system-health",
  },
];
