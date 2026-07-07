import { Match, MarketMakerQuote, OddsSnapshot } from "../types";

const BASE_SPREAD_PCT = 2;
const MAX_PRESSURE_CONTRIBUTION_PCT = 6;
const FIELD_PRESSURE_MAX = 45;
const UNRELIABLE_PENALTY_PCT = 4;
const SUSPENDED_PENALTY_PCT = 8;
const MIN_SPREAD_PCT = 2;
const MAX_SPREAD_PCT = 20;
const MIN_BID_ODDS = 1.01;

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSpreadWidth(spreadPct: number): "NARROW" | "MODERATE" | "WIDE" {
  if (spreadPct <= 4) return "NARROW";
  if (spreadPct <= 10) return "MODERATE";
  return "WIDE";
}

function buildReason(
  spreadWidth: "NARROW" | "MODERATE" | "WIDE",
  fieldPressureScore: number,
  reliability: MarketMakerQuote["reliability"]
): string {
  const pressureNote =
    fieldPressureScore >= 32
      ? "high field pressure"
      : fieldPressureScore >= 22
        ? "moderate field pressure"
        : fieldPressureScore > 0
          ? "low field pressure"
          : "no notable field pressure";

  const reliabilityNote =
    reliability === "SUSPENDED"
      ? "suspended/unreliable data"
      : reliability === "UNRELIABLE"
        ? "unreliable data"
        : reliability === "UNKNOWN"
          ? "no field context available"
          : "reliable data";

  const label =
    spreadWidth === "NARROW"
      ? "Narrow"
      : spreadWidth === "MODERATE"
        ? "Moderate"
        : "Wide";

  return `${label}: ${pressureNote} + ${reliabilityNote}`;
}

function quoteSide(fairOdds: number, halfSpread: number) {
  return {
    fairOdds: round(fairOdds),
    bidOdds: round(Math.max(MIN_BID_ODDS, fairOdds * (1 - halfSpread))),
    askOdds: round(fairOdds * (1 + halfSpread)),
  };
}

/**
 * Computes a defensible bid/ask spread around TxLINE's already-de-margined
 * fair odds for a match's outcomes. The spread widens with fieldPressureScore
 * (more dramatic in-play action = more uncertainty) and with reliability
 * problems (UNRELIABLE/SUSPENDED - quoting confidently on bad data is exactly
 * what a real market maker avoids). RELIABLE and UNKNOWN both get no
 * reliability penalty, matching the existing momentum score's own precedent
 * of not penalizing UNKNOWN (no scores event available is not evidence of bad
 * data, just absent context).
 *
 * Always computable from a single snapshot - unlike buildSignalFromSnapshots,
 * this needs no previous snapshot to compare against, so there is no null
 * case.
 */
export function computeMarketMakerQuote(
  match: Match,
  snapshot: OddsSnapshot
): MarketMakerQuote {
  const scoresContext = snapshot.evidence?.scoresContext;
  const fieldPressureScore = scoresContext?.fieldPressureScore ?? 0;
  const reliability = scoresContext?.reliability ?? "UNKNOWN";

  const pressureContribution =
    (fieldPressureScore / FIELD_PRESSURE_MAX) * MAX_PRESSURE_CONTRIBUTION_PCT;
  const reliabilityContribution =
    reliability === "SUSPENDED"
      ? SUSPENDED_PENALTY_PCT
      : reliability === "UNRELIABLE"
        ? UNRELIABLE_PENALTY_PCT
        : 0;

  const spreadPct = round(
    clamp(
      BASE_SPREAD_PCT + pressureContribution + reliabilityContribution,
      MIN_SPREAD_PCT,
      MAX_SPREAD_PCT
    )
  );
  const halfSpread = spreadPct / 200;
  const spreadWidth = getSpreadWidth(spreadPct);
  const reason = buildReason(spreadWidth, fieldPressureScore, reliability);

  const home = quoteSide(snapshot.homeOdds, halfSpread);
  const away = quoteSide(snapshot.awayOdds, halfSpread);
  const draw = quoteSide(snapshot.drawOdds, halfSpread);

  return {
    matchId: match.id,
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    fairOdds: { home: home.fairOdds, away: away.fairOdds, draw: draw.fairOdds },
    bidOdds: { home: home.bidOdds, away: away.bidOdds, draw: draw.bidOdds },
    askOdds: { home: home.askOdds, away: away.askOdds, draw: draw.askOdds },
    spreadPct,
    spreadWidth,
    reason,
    fieldPressureScore,
    reliability,
    computedAt: new Date().toISOString(),
  };
}
