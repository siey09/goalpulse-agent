import { AgentSignal, OddsSnapshot, Severity, TeamSide } from "../types";

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function getSeverity(changePct: number): Severity {
  if (changePct >= 15) return "HIGH";
  if (changePct >= 8) return "MEDIUM";
  if (changePct >= 4) return "LOW";
  return "NONE";
}

function calculateCompressionPct(previousOdds: number, currentOdds: number) {
  return ((previousOdds - currentOdds) / previousOdds) * 100;
}

function calculateMomentumScore(
  changePct: number,
  minute: number,
  scoreChanged: boolean
) {
  const oddsWeight = changePct * 0.55;
  const scoreImpact = scoreChanged ? 20 * 0.25 : 0;
  const timePressure = Math.min(minute / 90, 1) * 20 * 0.2;

  return round(oddsWeight + scoreImpact + timePressure);
}

export function buildSignalFromSnapshots(
  current: OddsSnapshot,
  previous: OddsSnapshot | undefined
): AgentSignal | null {
  if (!previous) return null;

  const homeCompression = calculateCompressionPct(
    previous.homeOdds,
    current.homeOdds
  );

  const awayCompression = calculateCompressionPct(
    previous.awayOdds,
    current.awayOdds
  );

  const side: TeamSide = homeCompression >= awayCompression ? "home" : "away";
  const bestChangePct = side === "home" ? homeCompression : awayCompression;

  const severity = getSeverity(bestChangePct);

  if (severity === "NONE") return null;

  const scoreChanged =
    previous.homeScore !== current.homeScore ||
    previous.awayScore !== current.awayScore;

  const target = side === "home" ? current.homeTeam : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : current.awayOdds;

  const momentumScore = calculateMomentumScore(
    bestChangePct,
    current.minute,
    scoreChanged
  );

  const signalType =
    severity === "HIGH"
      ? "SHARP_MOVE"
      : severity === "MEDIUM"
      ? "MOMENTUM_SHIFT"
      : "WATCH";

  const explanation =
    severity === "HIGH"
      ? `${target} odds compressed by ${round(
          bestChangePct
        )}% from ${oddsBefore} to ${oddsAfter}. The agent flags this as a high-severity sharp movement.`
      : severity === "MEDIUM"
      ? `${target} odds moved by ${round(
          bestChangePct
        )}% with sustained market direction. The agent flags this as a momentum shift.`
      : `${target} odds moved by ${round(
          bestChangePct
        )}%. The agent will continue watching this match for continuation.`;

  return {
    id: `signal-${current.matchId}-${Date.now()}-${side}`,
    matchId: current.matchId,
    match: `${current.homeTeam} vs ${current.awayTeam}`,
    target,
    side,
    signalType,
    severity,
    oddsBefore,
    oddsAfter,
    oddsChangePct: round(bestChangePct),
    momentumScore,
    explanation,
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
  };
}
