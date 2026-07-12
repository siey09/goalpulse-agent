import type { AgentSignal, Match } from "../types";

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in services/archive.ts) - the replay path's match and
 * snapshot classification must compare base fixture ids, not raw
 * matchIds, or a totals signal/snapshot can never find its real match.
 * Same implementation as signalPerformance.ts/signalCorrelation.ts's own
 * baseMatchId, duplicated locally per this codebase's convention of
 * small independent logic modules.
 */
export function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

/**
 * GET /api/replay/backtest's finished-vs-live snapshot bucketing must
 * compare against base fixture ids, not raw matchId - otherwise a totals
 * snapshot (matchId `<fixtureId>-totals-<line>`) never matches even when
 * its real fixture has finished, leaving totals signals permanently
 * "pending" in replay.
 */
export function isFinishedMatchId(matchId: string, finishedMatchIds: Set<string>): boolean {
  return finishedMatchIds.has(baseMatchId(matchId));
}

function findReplayMatch(matchId: string, replayMatches: Match[]): Match | undefined {
  return replayMatches.find((item) => item.id === baseMatchId(matchId));
}

/**
 * Must evaluate a draw outcome, not just home/away win conditions - a
 * draw signal replayed here would otherwise always settle "incorrect"
 * even on a real drawn final score, since this is a separate function
 * from store.ts's own live-path settlement.
 */
export function settleReplaySignal(
  signal: AgentSignal,
  replayMatches: Match[]
): "pending" | "correct" | "incorrect" {
  const match = findReplayMatch(signal.matchId, replayMatches);

  if (!match || match.status !== "finished") {
    return "pending";
  }

  const homeWon = match.homeScore > match.awayScore;
  const awayWon = match.awayScore > match.homeScore;
  const isDraw = match.homeScore === match.awayScore;

  if (
    (signal.side === "home" && homeWon) ||
    (signal.side === "away" && awayWon) ||
    (signal.side === "draw" && isDraw)
  ) {
    return "correct";
  }

  return "incorrect";
}

export interface ScoreRealityCheck {
  finalScore: string;
  scoreRealityStatus: "WAITING_FOR_FINAL_SCORE" | "CONFIRMED_BY_SCORE" | "REJECTED_BY_SCORE";
  scoreRealityReason: string;
}

/**
 * Same two fixes as settleReplaySignal above (draw support, base-fixture
 * id matching for totals signals) - this is a genuinely separate
 * evaluation (score-reality narrative text, not resultStatus), so it had
 * the identical pre-existing gap independently.
 */
export function checkScoreReality(
  signal: AgentSignal,
  resultStatus: "pending" | "correct" | "incorrect",
  replayMatches: Match[]
): ScoreRealityCheck {
  const match = findReplayMatch(signal.matchId, replayMatches);

  if (!match || match.status !== "finished") {
    return {
      finalScore: "Not settled yet",
      scoreRealityStatus: "WAITING_FOR_FINAL_SCORE",
      scoreRealityReason:
        "The match is still pending, so GoalPulse cannot compare the odds move against the final score yet.",
    };
  }

  const finalScore = `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`;
  const targetWon =
    (signal.side === "home" && match.homeScore > match.awayScore) ||
    (signal.side === "away" && match.awayScore > match.homeScore) ||
    (signal.side === "draw" && match.homeScore === match.awayScore);

  if (targetWon && resultStatus === "correct") {
    return {
      finalScore,
      scoreRealityStatus: "CONFIRMED_BY_SCORE",
      scoreRealityReason: `${signal.target} was backed by the odds movement and the final score confirmed it: ${finalScore}.`,
    };
  }

  return {
    finalScore,
    scoreRealityStatus: "REJECTED_BY_SCORE",
    scoreRealityReason: `${signal.target} was backed by the odds movement, but the final score did not confirm it: ${finalScore}. GoalPulse marks this as score-vs-odds disagreement.`,
  };
}
