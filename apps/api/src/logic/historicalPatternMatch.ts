import type { ArchiveEntry } from "../types";

export interface SimilarSignalsParams {
  signalType?: string;
  oddsChangePct?: number;
  fieldPressureScore?: number;
  excludeMatchId?: string;
}

export interface SimilarSignalEntry {
  matchId: string;
  signalType: string;
  severity: string;
  oddsChangePct: number;
  fieldPressureScore?: number;
  resultStatus: "correct" | "incorrect";
  archivedAt: string;
}

export interface SimilarSignalsResult {
  count: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  signals: SimilarSignalEntry[];
}

const ODDS_CHANGE_SPREAD = 30;
const FIELD_PRESSURE_SPREAD = 45;
const MAX_PER_MATCH = 2;
const MAX_RESULTS = 5;

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in archive.ts) - collapsing to the base fixture id keeps
 * one real match's several totals lines from being treated as distinct
 * matches, matching signalPerformance.ts's existing baseMatchId.
 */
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function distance(target: SimilarSignalsParams, candidate: ArchiveEntry): number {
  let total = 0;

  if (target.oddsChangePct !== undefined) {
    total += Math.abs(target.oddsChangePct - candidate.oddsChangePct) / ODDS_CHANGE_SPREAD;
  }

  const candidateFieldPressure = candidate.signalData?.evidence?.scoresContext?.fieldPressureScore;
  if (target.fieldPressureScore !== undefined && typeof candidateFieldPressure === "number") {
    total += Math.abs(target.fieldPressureScore - candidateFieldPressure) / FIELD_PRESSURE_SPREAD;
  }

  return total;
}

function emptyResult(): SimilarSignalsResult {
  return { count: 0, correctCount: 0, incorrectCount: 0, accuracyPct: 0, signals: [] };
}

/**
 * Finds settled archive signals of the same signalType as the target,
 * ranked by closeness on oddsChangePct/fieldPressureScore, excluding the
 * target's own match and capping each other match to 2 contributions so
 * one repeatedly-firing match can't dominate the comparison set (same
 * concentration bug class already found and fixed for Signal Performance
 * and Signal Correlation).
 */
export function findSimilarSignals(
  entries: ArchiveEntry[],
  target: SimilarSignalsParams
): SimilarSignalsResult {
  if (!target.signalType) return emptyResult();

  const excludeBase = target.excludeMatchId ? baseMatchId(target.excludeMatchId) : undefined;

  const candidates = entries.filter(
    (entry) =>
      entry.resultStatus !== "pending" &&
      entry.signalType === target.signalType &&
      (!excludeBase || baseMatchId(entry.matchId) !== excludeBase)
  );

  const byMatch = new Map<string, ArchiveEntry[]>();
  for (const entry of candidates) {
    const base = baseMatchId(entry.matchId);
    const existing = byMatch.get(base) ?? [];
    existing.push(entry);
    byMatch.set(base, existing);
  }

  const capped: ArchiveEntry[] = [];
  for (const group of byMatch.values()) {
    const sorted = [...group].sort((a, b) => distance(target, a) - distance(target, b));
    capped.push(...sorted.slice(0, MAX_PER_MATCH));
  }

  const selected = capped
    .sort((a, b) => distance(target, a) - distance(target, b))
    .slice(0, MAX_RESULTS);

  if (selected.length === 0) return emptyResult();

  const correctCount = selected.filter((entry) => entry.resultStatus === "correct").length;
  const incorrectCount = selected.length - correctCount;

  return {
    count: selected.length,
    correctCount,
    incorrectCount,
    accuracyPct: Math.round((correctCount / selected.length) * 100),
    signals: selected.map((entry) => ({
      matchId: entry.matchId,
      signalType: entry.signalType,
      severity: entry.severity,
      oddsChangePct: entry.oddsChangePct,
      fieldPressureScore: entry.signalData?.evidence?.scoresContext?.fieldPressureScore,
      resultStatus: entry.resultStatus as "correct" | "incorrect",
      archivedAt: entry.archivedAt,
    })),
  };
}
