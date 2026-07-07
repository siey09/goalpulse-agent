import {
  AgentSignal,
  ArenaAgentId,
  ArenaPosition,
  ArenaScoreboard,
  Match,
  OddsSnapshot,
  TeamSide,
} from "../types";

const MARKET_ONLY_THRESHOLD = 22;
const UNIT_STAKE = 1;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

/**
 * Reuses the exact threshold SignalIntelligencePanel.tsx already uses to
 * label a move "MARKET-ONLY MOVE" (fieldPressureScore < 22) vs
 * "FIELD-BACKED MOVE" - a live, causal check made from data already
 * attached to the signal at creation time, never the final match result.
 */
export function isMarketOnlyMove(signal: AgentSignal): boolean {
  return (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) < MARKET_ONLY_THRESHOLD;
}

/**
 * Mirrors the same target-string pattern store.ts's settlement logic uses to
 * detect Over/Under totals signals, duplicated locally per this codebase's
 * convention of small, independent logic modules.
 */
export function isTotalsSignal(signal: AgentSignal): boolean {
  return /^(Over|Under) [\d.]+$/.test(signal.target);
}

function settleUnit(resultStatus: "pending" | "correct" | "incorrect", oddsTaken: number): number {
  if (resultStatus === "correct") {
    const price = oddsTaken && oddsTaken > 1 ? oddsTaken : 1;
    return round(UNIT_STAKE * (price - 1));
  }

  if (resultStatus === "incorrect") return -UNIT_STAKE;

  return 0;
}

/**
 * Momentum Follower: takes the signal's own side, target, and odds at face
 * value. Its own independent computation (not a wrapper around the existing
 * getPnlSummary()), even though the underlying math is the same convention -
 * zero coupling risk between this feature and the existing P&L endpoint.
 */
export function buildMomentumFollowerPosition(signal: AgentSignal): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;

  return {
    agentId: "momentum_follower",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    target: signal.target,
    oddsTaken: signal.oddsAfter,
    resultStatus: signal.resultStatus,
    profitUnits: settleUnit(signal.resultStatus, signal.oddsAfter),
  };
}

/**
 * NOT a negation of the original signal's resultStatus: if the original was
 * "correct", the opposite side definitely lost. But if the original was
 * "incorrect", that could mean the opposite side won OR the match was a
 * draw - and in a draw, the opposite side also loses (neither side "won").
 * Requires the real match score to disambiguate.
 */
function resolveOpposingResult(
  originalResultStatus: AgentSignal["resultStatus"],
  match: Match | undefined,
  opposingSide: TeamSide
): "pending" | "correct" | "incorrect" {
  if (originalResultStatus === "pending") return "pending";
  if (!match || match.status !== "finished") return "pending";

  const homeWon = match.homeScore > match.awayScore;
  const awayWon = match.awayScore > match.homeScore;
  const opposingWon =
    (opposingSide === "home" && homeWon) || (opposingSide === "away" && awayWon);

  return opposingWon ? "correct" : "incorrect";
}

/**
 * Contrarian: fades signals that are market-only moves (see
 * isMarketOnlyMove), taking the opposite side. Reads the opposite side's
 * real quoted price from the same OddsSnapshot the original signal was
 * built from (originalSnapshot) - not a synthesized or estimated value.
 */
export function buildContrarianPosition(
  signal: AgentSignal,
  match: Match | undefined,
  originalSnapshot: OddsSnapshot | undefined
): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;
  if (!isMarketOnlyMove(signal)) return null;
  if (!originalSnapshot) return null;

  const opposingSide: TeamSide = signal.side === "home" ? "away" : "home";
  const opposingTarget =
    opposingSide === "home" ? originalSnapshot.homeTeam : originalSnapshot.awayTeam;
  const oddsTaken =
    opposingSide === "home" ? originalSnapshot.homeOdds : originalSnapshot.awayOdds;

  const resultStatus = resolveOpposingResult(signal.resultStatus, match, opposingSide);

  return {
    agentId: "contrarian",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: opposingSide,
    target: opposingTarget,
    oddsTaken,
    resultStatus,
    profitUnits: settleUnit(resultStatus, oddsTaken),
  };
}

function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
  const settled = positions.filter((position) => position.resultStatus !== "pending");
  const correct = settled.filter((position) => position.resultStatus === "correct");
  const incorrect = settled.filter((position) => position.resultStatus === "incorrect");
  const netUnits = round(settled.reduce((sum, position) => sum + position.profitUnits, 0));
  const roiPercent =
    settled.length === 0 ? 0 : round((netUnits / (settled.length * UNIT_STAKE)) * 100);
  const winRatePct =
    settled.length === 0 ? 0 : round((correct.length / settled.length) * 100);

  return {
    agentId,
    label,
    positions,
    settledCount: settled.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    winRatePct,
    netUnits,
    roiPercent,
    openPositions: positions.length - settled.length,
  };
}

export function computeArenaScoreboards(
  signals: AgentSignal[],
  matchesById: Map<string, Match>,
  snapshotsById: Map<string, OddsSnapshot>
): { momentumFollower: ArenaScoreboard; contrarian: ArenaScoreboard } {
  const momentumPositions: ArenaPosition[] = [];
  const contrarianPositions: ArenaPosition[] = [];

  for (const signal of signals) {
    const momentumPosition = buildMomentumFollowerPosition(signal);
    if (momentumPosition) momentumPositions.push(momentumPosition);

    const match = matchesById.get(signal.matchId);
    const snapshotId = signal.evidence?.currentSnapshotId;
    const snapshot = snapshotId ? snapshotsById.get(snapshotId) : undefined;
    const contrarianPosition = buildContrarianPosition(signal, match, snapshot);
    if (contrarianPosition) contrarianPositions.push(contrarianPosition);
  }

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    contrarian: summarize("contrarian", "Contrarian", contrarianPositions),
  };
}
