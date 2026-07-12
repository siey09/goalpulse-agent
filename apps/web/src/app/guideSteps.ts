import type { DestinationId } from "./navigation";

export interface GuideStep {
  title: string;
  detail: string;
  destination: DestinationId;
  /** Preferred lookup: an explicit id on the target element. */
  targetId?: string;
  /** Fallback lookup: fuzzy match against a card's text content. */
  targetText?: string;
  /** Some replay-lab steps only render once a backtest has run. */
  requiresReplayBacktest?: boolean;
}

/**
 * Single source of truth for the Command Center guided tour: each step
 * carries its own destination and target, replacing the old default
 * page's two hand-kept-in-sync arrays (judgeDemoSteps + guideTargets)
 * plus scattered judgeStep===N JSX conditionals. This tour is additive -
 * it only runs inside the ?preview=command-center experience and does
 * not touch the original default-page tour.
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    title: "1. Autonomous intelligence overview",
    detail:
      "GoalPulse ingests TxLINE data, normalizes match markets, monitors odds movement, and explains signals without manual analyst work.",
    destination: "command-center",
    targetId: "guide-command-center-overview",
  },
  {
    title: "2. Odds movement timeline",
    detail:
      "The chart shows how market prices move over time. Signal markers appear only when movement crosses deterministic compression thresholds.",
    destination: "live-markets",
    targetId: "guide-odds-chart",
  },
  {
    title: "3. TxLINE market board",
    detail:
      "The market board shows normalized home, draw, and away prices plus precise TXODDS status and clock labels.",
    destination: "live-markets",
    targetId: "guide-market-board",
  },
  {
    title: "4. Scores intelligence signals",
    detail:
      "Signals combine odds movement with TXODDS Scores context: goals, shots, VAR, penalties, cards, danger possession, and reliability warnings.",
    destination: "signals",
    targetId: "signal-intelligence",
  },
  {
    title: "5. Final score audit",
    detail:
      "Signals are checked after final score settlement so judges can see whether each movement was confirmed or rejected.",
    destination: "signals",
    targetId: "guide-outcome-verification",
  },
  {
    title: "6. Match state and signal pressure",
    detail:
      "Review the selected match, exact score and status, and the current signal-pressure comparison.",
    destination: "live-markets",
    targetId: "guide-selected-match",
  },
  {
    title: "7. In-Play Market Maker",
    detail:
      "The Market Maker quotes a live bid/ask spread around TxLINE's de-margined fair odds, widening under field pressure or unreliable data and narrowing when conditions are calm.",
    destination: "market-maker",
    targetText: "Live bid/ask quotes",
  },
  {
    title: "8. Steam move detection",
    detail:
      "Steam Move Detection scans every match every 5 seconds for sustained same-direction odds movement, flagging genuine momentum building before it becomes an obvious signal.",
    destination: "signals",
    targetText: "Steam move detection",
  },
  {
    title: "9. Agent vs Agent Arena",
    detail:
      "Three strategies compete on the same live signal feed: Momentum Follower trusts the signal, Contrarian fades signals without real field support, and Kelly Criterion sizes its stake by confidence — settlement is on-chain-verified.",
    destination: "agent-arena",
    targetText: "Momentum Follower vs Contrarian vs Kelly Criterion",
  },
  {
    title: "10. Meta-agent & Skeptic Check",
    detail:
      "The Arena doesn't just race three strategies — it audits its own leaderboard. A Meta-agent recommendation ranks strategies fairly by ROI, not raw units, and only names a leader once there's enough settled data. A Skeptic Check then questions that lead directly: if it's concentrated in one real match, it says so plainly instead of implying more confidence than the data supports.",
    destination: "agent-arena",
    targetId: "guide-meta-skeptic",
  },
  {
    title: "11. Autonomous agent timeline",
    detail:
      "The timeline explains the agent loop: ingest feed, capture snapshots, compare odds, attach scores context, score reliability, and store evidence.",
    destination: "command-center",
    targetId: "guide-decision-feed",
  },
  {
    title: "12. Real TxLINE replay",
    detail:
      "Replay mode runs stored TxLINE snapshots through the same engine, making the demo repeatable even when live matches are quiet.",
    destination: "replay-lab",
    targetId: "guide-backtest-card",
    requiresReplayBacktest: true,
  },
  {
    title: "13. Evidence chain",
    detail:
      "The evidence chain links odds endpoints, scores endpoints, message IDs, bookmakers, scoreline context, and proof labels for judge-verifiable review.",
    destination: "replay-lab",
    targetId: "guide-event-correlation",
    requiresReplayBacktest: true,
  },
  {
    title: "14. Signal review council",
    detail:
      "Multiple agent checks review movement strength, field context, reliability, reversion risk, and evidence quality before surfacing a signal.",
    destination: "replay-lab",
    targetId: "guide-oracle-council",
    requiresReplayBacktest: true,
  },
  {
    title: "15. Proof hash",
    detail:
      "The replay generates a SHA-256 proof hash so the audit trail can become tamper-evident and independently reviewable.",
    destination: "replay-lab",
    targetId: "guide-proof-readiness",
    requiresReplayBacktest: true,
  },
  {
    title: "16. Signal detail: precedent & verification",
    detail:
      'Click "View details" on any signal card to open its full evidence trail yourself. The Verification destination shows a Verification Depth badge - whether that specific signal\'s underlying data has actually been checked on Solana mainnet - never a percentage, always a plain, honest status.',
    destination: "verification",
    targetId: "guide-verification-receipt",
  },
  {
    title: "17. Transparent thresholds",
    detail:
      "The engine uses explainable thresholds: watch, momentum shift, and sharp move. No black-box betting recommendation is required.",
    destination: "system-health",
    targetText: "Signal Thresholds",
  },
  {
    title: "18. Full tournament archive",
    detail:
      "The archive permanently records every settled signal — status, severity, and market — independent of the dashboard's in-memory caps, giving judges the complete, unfiltered track record.",
    destination: "archive",
    targetText: "Full tournament archive",
  },
  {
    title: "19. Signal performance",
    detail:
      "Signal Performance breaks accuracy down by signal type — sharp move, momentum shift, watch — showing correct-versus-settled counts so judges can see where the model's calls actually hold up.",
    destination: "archive",
    targetText: "Signal performance",
  },
  {
    title: "20. Confidence calibration",
    detail:
      "Confidence Calibration checks whether the model's own confidence score is honest: higher-confidence signals should settle correct more often, and this panel proves whether that pattern actually holds.",
    destination: "archive",
    targetText: "Confidence calibration",
  },
  {
    title: "21. Signal correlation",
    detail:
      "Signal Correlation finds clusters of the same pattern firing across multiple real matches — side, severity, and market aligned — evidence the model is detecting a real phenomenon, not noise.",
    destination: "signals",
    targetText: "Signal correlation",
  },
  {
    title: "22. Compliance boundary",
    detail:
      "GoalPulse is analytics-only: it explains sports market movement and evidence context. It does not place wagers, custody funds, or facilitate betting execution.",
    destination: "signals",
    targetId: "app-shell-compliance",
  },
];
