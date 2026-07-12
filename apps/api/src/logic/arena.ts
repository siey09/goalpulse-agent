import {
  AgentSignal,
  ArenaAgentId,
  ArenaPosition,
  ArenaRejection,
  ArenaScoreboard,
  Match,
  OddsSnapshot,
  TeamSide,
} from "../types";

const MARKET_ONLY_THRESHOLD = 22;
const UNIT_STAKE = 1;
const MAX_EDGE = 0.15;
const MAX_STAKE_FRACTION = 0.2;
const KELLY_BANKROLL_UNITS = 10;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

/**
 * Generalizes the old flat-UNIT_STAKE settlement to any stake size, so
 * Momentum Follower/Contrarian (always UNIT_STAKE) and Kelly Criterion
 * (variable) share one settlement function. Negation is written as
 * `0 - stakeUnits`, not `-stakeUnits`, so a 0-stake incorrect position
 * settles to +0, not -0 - a real distinction under Vitest's
 * Object.is-based toBe(), which Kelly's legitimately-zero stakes can hit
 * (the flat-stake agents never could, since UNIT_STAKE is always 1).
 */
function settleStake(
  resultStatus: "pending" | "correct" | "incorrect",
  oddsTaken: number,
  stakeUnits: number
): number {
  if (resultStatus === "correct") {
    const price = oddsTaken && oddsTaken > 1 ? oddsTaken : 1;
    return round(stakeUnits * (price - 1));
  }

  if (resultStatus === "incorrect") return 0 - stakeUnits;

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
    stakeUnits: UNIT_STAKE,
    resultStatus: signal.resultStatus,
    profitUnits: settleStake(signal.resultStatus, signal.oddsAfter, UNIT_STAKE),
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
  if (signal.side === "draw") return null;
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
    stakeUnits: UNIT_STAKE,
    resultStatus,
    profitUnits: settleStake(resultStatus, oddsTaken, UNIT_STAKE),
  };
}

/**
 * Mirrors the exact null-cases already in buildMomentumFollowerPosition/
 * buildContrarianPosition/buildKellyCriterionPosition above, so a caller
 * building a scoreboard can explain every position-build miss without
 * changing those three functions' existing signatures/tests. Scoped to
 * Arena only (not signal-generation-level silent drops elsewhere) per
 * explicit user confirmation during brainstorming.
 */
export function getRejectionReason(
  agentId: ArenaAgentId,
  signal: AgentSignal,
  originalSnapshot: OddsSnapshot | undefined
): ArenaRejection | null {
  if (isTotalsSignal(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "totals_signal",
      reasonText: "Totals signal — Arena only trades 1X2 markets.",
    };
  }

  if (agentId === "kelly_criterion") {
    if (exceedsKellyRiskLimit(signal.oddsAfter, signal.confidenceScore ?? 0)) {
      return {
        agentId,
        signalId: signal.id,
        matchId: signal.matchId,
        reason: "risk_limit_exceeded",
        reasonText:
          "Risk limit exceeded — Kelly Criterion's raw stake sizing exceeded the maximum bankroll fraction.",
      };
    }
    return null;
  }

  if (agentId !== "contrarian") return null;

  if (signal.side === "draw") {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "draw_signal",
      reasonText: "Draw signal — Contrarian has no principled opposite in a 3-outcome market.",
    };
  }

  if (!isMarketOnlyMove(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "not_market_only_move",
      reasonText: "Field-backed move — Contrarian only fades market-only moves.",
    };
  }

  if (!originalSnapshot) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "no_original_snapshot",
      reasonText: "Original odds snapshot unavailable — cannot price the opposite side.",
    };
  }

  return null;
}

/**
 * confidenceScore (0-100) is a quality measure, not a literal win
 * probability - using it as one directly would be a category error.
 * Instead it scales an assumed edge over the market's own implied
 * probability (1/oddsTaken), capped at MAX_EDGE. At confidenceScore=0 the
 * edge is exactly 0, which algebraically zeroes the Kelly fraction for
 * any odds value (our probability estimate collapses back to exactly the
 * market's own break-even price). The raw Kelly fraction is capped at
 * MAX_STAKE_FRACTION (full Kelly can recommend unrealistically large
 * fractions) then scaled by KELLY_BANKROLL_UNITS so stakes land in a
 * range comparable to the other agents' flat 1-unit bets.
 */
function computeRawKellyFraction(oddsTaken: number, confidenceScore: number): number {
  if (oddsTaken <= 1) return 0;

  const marketImpliedProb = 1 / oddsTaken;
  const edgeFraction = (clamp(confidenceScore, 0, 100) / 100) * MAX_EDGE;
  const ourProbEstimate = clamp(marketImpliedProb + edgeFraction, 0, 1);

  const b = oddsTaken - 1;
  const p = ourProbEstimate;
  const q = 1 - p;

  return (b * p - q) / b;
}

export function calculateKellyStake(oddsTaken: number, confidenceScore: number): number {
  const kellyFraction = clamp(
    computeRawKellyFraction(oddsTaken, confidenceScore),
    0,
    MAX_STAKE_FRACTION
  );

  return round(kellyFraction * KELLY_BANKROLL_UNITS);
}

/**
 * A real risk-limit check, distinct from calculateKellyStake's own
 * clamp: a raw Kelly fraction beyond MAX_STAKE_FRACTION rejects the
 * position outright rather than silently resizing it down to the cap.
 * Checks the same raw (uncapped) fraction calculateKellyStake computes
 * internally, so the two functions can never disagree about what the
 * "true" desired stake was before capping.
 */
export function exceedsKellyRiskLimit(oddsTaken: number, confidenceScore: number): boolean {
  return computeRawKellyFraction(oddsTaken, confidenceScore) > MAX_STAKE_FRACTION;
}

/**
 * Kelly Criterion: takes the SAME side as the original signal (a sizing
 * strategy, not a direction strategy, unlike Contrarian) - only how much
 * to stake varies, driven by confidenceScore.
 */
export function buildKellyCriterionPosition(signal: AgentSignal): ArenaPosition | null {
  if (isTotalsSignal(signal)) return null;
  if (exceedsKellyRiskLimit(signal.oddsAfter, signal.confidenceScore ?? 0)) return null;

  const stakeUnits = calculateKellyStake(signal.oddsAfter, signal.confidenceScore ?? 0);

  return {
    agentId: "kelly_criterion",
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    target: signal.target,
    oddsTaken: signal.oddsAfter,
    stakeUnits,
    resultStatus: signal.resultStatus,
    profitUnits: settleStake(signal.resultStatus, signal.oddsAfter, stakeUnits),
  };
}

export function summarize(
  agentId: ArenaAgentId,
  label: string,
  positions: ArenaPosition[]
): ArenaScoreboard {
  const settled = positions.filter((position) => position.resultStatus !== "pending");
  const correct = settled.filter((position) => position.resultStatus === "correct");
  const incorrect = settled.filter((position) => position.resultStatus === "incorrect");
  const netUnits = round(settled.reduce((sum, position) => sum + position.profitUnits, 0));
  const totalStaked = settled.reduce((sum, position) => sum + position.stakeUnits, 0);
  const roiPercent = totalStaked === 0 ? 0 : round((netUnits / totalStaked) * 100);
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
): {
  momentumFollower: ArenaScoreboard;
  contrarian: ArenaScoreboard;
  kellyCriterion: ArenaScoreboard;
  rejections: ArenaRejection[];
} {
  const momentumPositions: ArenaPosition[] = [];
  const contrarianPositions: ArenaPosition[] = [];
  const kellyPositions: ArenaPosition[] = [];
  const rejections: ArenaRejection[] = [];

  for (const signal of signals) {
    const match = matchesById.get(signal.matchId);
    const snapshotId = signal.evidence?.currentSnapshotId;
    const snapshot = snapshotId ? snapshotsById.get(snapshotId) : undefined;

    const momentumPosition = buildMomentumFollowerPosition(signal);
    if (momentumPosition) {
      momentumPositions.push(momentumPosition);
    } else {
      const rejection = getRejectionReason("momentum_follower", signal, snapshot);
      if (rejection) rejections.push(rejection);
    }

    const contrarianPosition = buildContrarianPosition(signal, match, snapshot);
    if (contrarianPosition) {
      contrarianPositions.push(contrarianPosition);
    } else {
      const rejection = getRejectionReason("contrarian", signal, snapshot);
      if (rejection) rejections.push(rejection);
    }

    const kellyPosition = buildKellyCriterionPosition(signal);
    if (kellyPosition) {
      kellyPositions.push(kellyPosition);
    } else {
      const rejection = getRejectionReason("kelly_criterion", signal, snapshot);
      if (rejection) rejections.push(rejection);
    }
  }

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    contrarian: summarize("contrarian", "Contrarian", contrarianPositions),
    kellyCriterion: summarize("kelly_criterion", "Kelly Criterion", kellyPositions),
    rejections,
  };
}
