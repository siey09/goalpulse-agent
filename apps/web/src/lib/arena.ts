// Shared with the Command Center overview's Strategy Leader card, which
// self-fetches the same /api/arena endpoint to show the identical
// recommendation without duplicating the ranking logic.

export type ArenaAgentId = "momentum_follower" | "contrarian" | "kelly_criterion";

export type ArenaPosition = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  match: string;
  side: "home" | "away" | "draw";
  target: string;
  oddsTaken: number;
  stakeUnits: number;
  resultStatus: "pending" | "correct" | "incorrect";
  profitUnits: number;
};

export type ArenaScoreboard = {
  agentId: ArenaAgentId;
  label: string;
  positions: ArenaPosition[];
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  winRatePct: number;
  netUnits: number;
  roiPercent: number;
  openPositions: number;
};

export type ArenaRejection = {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  reason:
    | "totals_signal"
    | "not_market_only_move"
    | "no_original_snapshot"
    | "draw_signal"
    | "risk_limit_exceeded";
  reasonText: string;
};

export type ArenaProof = {
  type: "sha256";
  hash: string;
  verifiableStat: { fixtureId: number; seq: number; statKey: number } | null;
  note: string;
};

export type ArenaResponse = {
  momentumFollower: ArenaScoreboard;
  contrarian: ArenaScoreboard;
  kellyCriterion: ArenaScoreboard;
  rejections: ArenaRejection[];
  proof: ArenaProof;
};

export const MIN_SETTLED_FOR_RANKING = 5;
export const NARROW_MARGIN_THRESHOLD_PCT = 10;

export const STRATEGY_MECHANISM: Record<ArenaAgentId, string> = {
  momentum_follower: "takes every signal at face value",
  contrarian: "fades signals that fire without real field support",
  kelly_criterion: "sizes stakes by the model's own confidence score instead of betting flat",
};

export type MetaAgentRecommendation = {
  agentId: ArenaAgentId | null;
  message: string;
};

export function formatRoi(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

export function getMetaAgentRecommendation(arena: ArenaResponse | null): MetaAgentRecommendation {
  if (!arena) {
    return { agentId: null, message: "Waiting for arena data." };
  }

  const scoreboards = [arena.momentumFollower, arena.contrarian, arena.kellyCriterion];
  const qualifying = scoreboards.filter((s) => s.settledCount >= MIN_SETTLED_FOR_RANKING);

  if (qualifying.length < 2) {
    return {
      agentId: null,
      message: "Not enough settled positions yet to recommend a leading strategy.",
    };
  }

  const sorted = [...qualifying].sort((a, b) => b.roiPercent - a.roiPercent);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const margin = leader.roiPercent - runnerUp.roiPercent;
  const isNarrow = margin < NARROW_MARGIN_THRESHOLD_PCT;

  const marginText = isNarrow
    ? `a narrow lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)}) — worth revisiting as more signals settle`
    : `a clear lead over ${runnerUp.label} (${formatRoi(runnerUp.roiPercent)})`;

  return {
    agentId: leader.agentId,
    message: `${leader.label} currently leads on ROI at ${formatRoi(leader.roiPercent)} over ${leader.settledCount} settled positions — ${marginText}. It ${STRATEGY_MECHANISM[leader.agentId]}.`,
  };
}
