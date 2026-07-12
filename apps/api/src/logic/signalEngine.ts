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

/**
 * Raw compression (calculateCompressionPct above) and de-vigged
 * implied-probability movement are reported separately, not conflated.
 * TxLINE's feed is already de-vigged at the source (implied
 * probabilities sum to ~1.0 in real live data), so this is a direct
 * 1/odds conversion, not a new de-vig calculation. Same sign convention
 * as calculateCompressionPct:
 * positive means the move strengthened this side (shorter odds, higher
 * implied probability), matching oddsChangePct's own positive direction
 * for the identical move.
 */
function calculateProbabilityPointShift(oddsBefore: number, oddsAfter: number) {
  return (1 / oddsAfter - 1 / oddsBefore) * 100;
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
 * Both values are derived from real signal_archive data, not invented -
 * but the sample is modest and concentrated across few real matches, so
 * treat these as provisional, not authoritative. Re-check against a
 * larger sample as more archived signals settle.
 *
 * LONGSHOT_ODDS_THRESHOLD: accuracy breaks at the same decimal-odds
 * level (3.0) independently in both markets - 1X2 60%->0% at the
 * [1,3)/[3,6) boundary, totals 62-63%->25-27% at the same boundary.
 * LONGSHOT_CONFIDENCE_FACTOR: the real combined accuracy ratio across
 * both markets - 159 settled signals below the cliff were 62.9%
 * accurate, 135 at/above it were 17.8% accurate (17.8/62.9 ~= 0.283,
 * rounded to 0.3).
 */
const LONGSHOT_ODDS_THRESHOLD = 3;
const LONGSHOT_CONFIDENCE_FACTOR = 0.3;

/**
 * A composite confidence measure, separate from severity/momentumScore:
 * magnitude (weight 0.5, normalized against the existing 15% HIGH severity
 * threshold), field pressure (weight 0.3, normalized against
 * marketMaker.ts's own FIELD_PRESSURE_MAX), and freshness tightness
 * (weight 0.2). Weights are renormalized among only the available
 * components when scoresContext is absent, so a signal with no field
 * context is scored on magnitude alone rather than penalized for missing
 * data it never had a chance to have. A longshot-odds penalty is applied
 * after this base composite (see LONGSHOT_ODDS_THRESHOLD above) - kept as
 * a separate multiplicative step, not a 4th weighted component, so the
 * base composite's own math stays unchanged for every non-longshot signal.
 */
export function calculateConfidenceScore(
  changePct: number,
  scoresContext: TxLineScoresContext | undefined,
  freshnessTightness: number | null,
  oddsAfter: number
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

  const baseScore = round(weightedSum / totalWeight);

  return oddsAfter >= LONGSHOT_ODDS_THRESHOLD
    ? round(baseScore * LONGSHOT_CONFIDENCE_FACTOR)
    : baseScore;
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
  oddsAfter: number,
  scoresContext?: TxLineScoresContext
) {
  const longshotSentence =
    oddsAfter >= LONGSHOT_ODDS_THRESHOLD
      ? ` Note: quoted at long-shot odds (${oddsAfter}) - confidence reduced accordingly, matching archived-data accuracy at this odds level.`
      : "";

  if (!scoresContext) {
    return ` No matching TXODDS Scores event context was available, so this is treated as a market-only movement.${longshotSentence}`;
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

  return `${pressureSentence}${sideSentence}${status}${scoreline} ${reliabilitySentence}${longshotSentence}`;
}
function buildBaseExplanation(
  severity: Severity,
  target: string,
  changePct: number,
  oddsBefore: number,
  oddsAfter: number,
  probabilityPointShiftPct: number
) {
  const probabilitySentence = ` This is a separate ${round(probabilityPointShiftPct)} percentage-point implied-probability shift, distinct from the raw odds compression above.`;

  if (severity === "HIGH") {
    return `${target} odds compressed by ${round(changePct)}% from ${oddsBefore} to ${oddsAfter}. The agent flags this as a high-severity sharp movement.${probabilitySentence}`;
  }

  if (severity === "MEDIUM") {
    return `${target} odds moved by ${round(changePct)}% with sustained market direction. The agent flags this as a momentum shift.${probabilitySentence}`;
  }

  return `${target} odds moved by ${round(changePct)}%. The agent will continue watching this match for continuation.${probabilitySentence}`;
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

  const drawCompression = calculateCompressionPct(
    previous.drawOdds,
    current.drawOdds
  );

  const side: TeamSide =
    homeCompression >= drawCompression && homeCompression >= awayCompression
      ? "home"
      : drawCompression >= awayCompression
        ? "draw"
        : "away";

  const bestChangePct =
    side === "home" ? homeCompression : side === "draw" ? drawCompression : awayCompression;

  const severity = getSeverity(bestChangePct);

  if (severity === "NONE") return null;

  const scoreChanged =
    previous.homeScore !== current.homeScore ||
    previous.awayScore !== current.awayScore;

  const target = side === "home" ? current.homeTeam : side === "draw" ? "Draw" : current.awayTeam;
  const oddsBefore = side === "home" ? previous.homeOdds : side === "draw" ? previous.drawOdds : previous.awayOdds;
  const oddsAfter = side === "home" ? current.homeOdds : side === "draw" ? current.drawOdds : current.awayOdds;
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

  const confidenceScore = calculateConfidenceScore(bestChangePct, scoresContext, freshnessTightness, oddsAfter);

  const signalType =
    severity === "HIGH"
      ? "SHARP_MOVE"
      : severity === "MEDIUM"
        ? "MOMENTUM_SHIFT"
        : "WATCH";

  const probabilityPointShiftPct = calculateProbabilityPointShift(oddsBefore, oddsAfter);

  const explanation = `${buildBaseExplanation(
    severity,
    target,
    bestChangePct,
    oddsBefore,
    oddsAfter,
    probabilityPointShiftPct
  )}${buildContextExplanation(target, side, oddsAfter, scoresContext)}`;

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
    probabilityPointShiftPct: round(probabilityPointShiftPct),
    momentumScore,
    confidenceScore,
    explanation,
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    evidence,
  };
}

