import { computeMarketMakerQuote } from "./marketMaker";
import type { AgentSignal, Match, OddsSnapshot, Severity, TeamSide } from "../types";

export interface BandBreachResult {
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  previousBandBid: number;
  previousBandAsk: number;
  bandBreached: boolean;
}

/**
 * Genuinely independent cross-check against the signal's own severity
 * classification: computes what the Market Maker would have quoted using
 * the snapshot from before the move, then checks whether the move's actual
 * post-move odds broke through that old quote's bid (its lower bound) for
 * the signal's side. Compression always means the winning side's odds got
 * shorter, so breaching the old bid is the direction-consistent test - a
 * move that outpaced the market's own prior uncertainty allowance, not
 * just a restatement of the same fieldPressureScore that already feeds
 * both this quote and the signal's own momentum score.
 */
export function assessBandBreach(
  signal: AgentSignal,
  match: Match,
  previousSnapshot: OddsSnapshot
): BandBreachResult {
  const previousQuote = computeMarketMakerQuote(match, previousSnapshot);
  const previousBandBid = previousQuote.bidOdds[signal.side];
  const previousBandAsk = previousQuote.askOdds[signal.side];

  return {
    signalId: signal.id,
    matchId: signal.matchId,
    match: signal.match,
    side: signal.side,
    severity: signal.severity,
    oddsBefore: signal.oddsBefore,
    oddsAfter: signal.oddsAfter,
    previousBandBid,
    previousBandAsk,
    bandBreached: signal.oddsAfter < previousBandBid,
  };
}

export interface BandBreachSummary {
  totalChecked: number;
  confirmedCount: number;
  unconfirmedCount: number;
  confirmationRatePct: number;
}

export function summarizeBandBreaches(results: BandBreachResult[]): BandBreachSummary {
  const confirmedCount = results.filter((result) => result.bandBreached).length;
  const unconfirmedCount = results.length - confirmedCount;
  const confirmationRatePct =
    results.length > 0 ? Math.round((confirmedCount / results.length) * 100) : 0;

  return {
    totalChecked: results.length,
    confirmedCount,
    unconfirmedCount,
    confirmationRatePct,
  };
}
