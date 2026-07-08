import { AgentSignal, OddsSnapshot, Severity, TeamSide, TxLineScoresContext } from "../types";
import {
  computeFreshnessTightness,
  isScoresContextFresh,
  SCORES_CONTEXT_TOLERANCE_MS,
} from "./scoresContextFreshness";
import { FIELD_PRESSURE_MAX } from "./marketMaker";

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
  scoreChanged: boolean,
  scoresContext?: TxLineScoresContext
) {
  const oddsWeight = changePct * 0.55;
  const scoreImpact = scoreChanged ? 20 * 0.25 : 0;
  const timePressure = Math.min(minute / 90, 1) * 20 * 0.2;
  const fieldPressure = (scoresContext?.fieldPressureScore ?? 0) * 0.35;
  const reliabilityPenalty =
    scoresContext?.reliability === "SUSPENDED"
      ? 18
      : scoresContext?.reliability === "UNRELIABLE"
        ? 10
        : 0;

  return round(clamp(oddsWeight + scoreImpact + timePressure + fieldPressure - reliabilityPenalty, 0, 100));
}

const MAGNITUDE_REFERENCE_PCT = 15;

/**
 * A composite confidence measure, separate from severity/momentumScore:
 * magnitude (weight 0.5, normalized against the existing 15% HIGH severity
 * threshold), field pressure (weight 0.3, normalized against
 * marketMaker.ts's own FIELD_PRESSURE_MAX), and freshness tightness
 * (weight 0.2). Weights are renormalized among only the available
 * components when scoresContext is absent, so a signal with no field
 * context is scored on magnitude alone rather than penalized for missing
 * data it never had a chance to have.
 */
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null
): number {
  const magnitudeScore = clamp((changePct / MAGNITUDE_REFERENCE_PCT) * 100, 0, 100);

  const components: { score: number; weight: number }[] = [{ score: magnitudeScore, weight: 0.5 }];

  if (scoresContext && freshnessTightness !== null) {
    const fieldPressureScore = clamp(
      ((scoresContext.fieldPressureScore ?? 0) / FIELD_PRESSURE_MAX) * 100,
      0,
      100
    );
    components.push({ score: fieldPressureScore, weight: 0.3 });
    components.push({ score: clamp(freshnessTightness, 0, 100), weight: 0.2 });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const weightedSum = components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0
  );

  return round(weightedSum / totalWeight);
}

function sideLabel(side?: TxLineScoresContext["actionTeam"]) {
  if (side === "home") return "home side";
  if (side === "away") return "away side";
  if (side === "neutral") return "neutral event";
  return "unknown side";
}

function buildContextExplanation(
  target: string,
  signalSide: TeamSide,
  scoresContext?: TxLineScoresContext
) {
  if (!scoresContext) {
    return " No matching TXODDS Scores event context was available, so this is treated as a market-only movement.";
  }

  const action = scoresContext.actionLabel ?? scoresContext.latestAction ?? "field event";
  const pressure = scoresContext.pressureLevel ?? "NONE";
  const pressureScore = scoresContext.fieldPressureScore ?? 0;
  const scoreline = scoresContext.scoreline ? ` Scoreline: ${scoresContext.scoreline}.` : "";
  const status = scoresContext.statusName ? ` Match phase: ${scoresContext.statusName}.` : "";
  const sameSide =
    scoresContext.actionTeam === signalSide ||
    scoresContext.actionTeam === "unknown" ||
    scoresContext.actionTeam === undefined;

  const pressureSentence =
    pressureScore >= 32
      ? ` The move is field-backed by a ${action} event with ${pressure.toLowerCase()} pressure.`
      : pressureScore >= 22
        ? ` The move has moderate field context from a ${action} event.`
        : pressureScore > 0
          ? ` The latest field context is low pressure: ${action}.`
          : ` The latest Scores event did not show strong field pressure: ${action}.`;

  const sideSentence = sameSide
    ? ` The event context aligns with ${target} or has no clear side conflict.`
    : ` Caution: the latest field event came from the ${sideLabel(scoresContext.actionTeam)}, not the signal side.`;

  const reliabilitySentence =
    scoresContext.reliability === "SUSPENDED" || scoresContext.reliability === "UNRELIABLE"
      ? ` Reliability warning: ${scoresContext.reliabilityReason ?? "TXODDS marked the event context as unreliable."}`
      : ` Reliability check: ${scoresContext.reliabilityReason ?? "No TXODDS reliability warning was found."}`;

  return `${pressureSentence}${sideSentence}${status}${scoreline} ${reliabilitySentence}`;
}
function buildBaseExplanation(
  severity: Severity,
  target: string,
  changePct: number,
  oddsBefore: number,
  oddsAfter: number
) {
  if (severity === "HIGH") {
    return `${target} odds compressed by ${round(changePct)}% from ${oddsBefore} to ${oddsAfter}. The agent flags this as a high-severity sharp movement.`;
  }

  if (severity === "MEDIUM") {
    return `${target} odds moved by ${round(changePct)}% with sustained market direction. The agent flags this as a momentum shift.`;
  }

  return `${target} odds moved by ${round(changePct)}%. The agent will continue watching this match for continuation.`;
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
  const scoresContext =
    current.evidence?.scoresContext ??
    (isScoresContextFresh(
      new Date(current.createdAt).getTime(),
      previous.evidence?.scoresContext?.timestamp,
      SCORES_CONTEXT_TOLERANCE_MS
    )
      ? previous.evidence?.scoresContext
      : undefined);

  const freshnessTightness = scoresContext
    ? computeFreshnessTightness(
        new Date(current.createdAt).getTime(),
        scoresContext.timestamp,
        SCORES_CONTEXT_TOLERANCE_MS
      )
    : null;

  const momentumScore = calculateMomentumScore(
    bestChangePct,
    current.minute,
    scoreChanged,
    scoresContext
  );

  const confidenceScore = calculateConfidenceScore(bestChangePct, scoresContext, freshnessTightness);

  const signalType =
    severity === "HIGH"
      ? "SHARP_MOVE"
      : severity === "MEDIUM"
        ? "MOMENTUM_SHIFT"
        : "WATCH";

  const explanation = `${buildBaseExplanation(
    severity,
    target,
    bestChangePct,
    oddsBefore,
    oddsAfter
  )}${buildContextExplanation(target, side, scoresContext)}`;

  const evidence = {
    ...(current.evidence ?? previous.evidence),
    source: current.source,
    scoresContext,
    previousSnapshotId: previous.id,
    currentSnapshotId: current.id,
    previousTimestamp: previous.createdAt,
    currentTimestamp: current.createdAt,
    proofLabel:
      current.source === "txline"
        ? scoresContext
          ? "Generated from real TxLINE odds movement data and TXODDS Scores event context"
          : "Generated from real TxLINE odds movement data"
        : "Generated from simulated sandbox feed",
  } as AgentSignal["evidence"];

  return {
    id: `signal-${current.matchId}-${current.id}-${side}`,
    matchId: current.matchId,
    match: current.matchLabel ?? `${current.homeTeam} vs ${current.awayTeam}`,
    target,
    side,
    signalType,
    severity,
    oddsBefore,
    oddsAfter,
    oddsChangePct: round(bestChangePct),
    momentumScore,
    confidenceScore,
    explanation,
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    evidence,
  };
}

