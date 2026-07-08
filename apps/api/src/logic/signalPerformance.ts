import type { ArchiveEntry } from "../types";

export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  distinctMatchCount: number;
  largestMatchSharePct: number;
}

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in archive.ts) - six different total-goals lines for
 * the same real match would otherwise count as six "distinct matches,"
 * understating concentration exactly as found during the SHARP_MOVE
 * accuracy investigation (2026-07-09).
 */
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

/**
 * Groups archived signal entries by signalType and reports historical
 * accuracy per type from settled outcomes. Pending entries (never
 * settled) are excluded entirely - they carry no historical-accuracy
 * information.
 */
export function summarizeSignalTypePerformance(
  entries: ArchiveEntry[]
): SignalTypePerformance[] {
  const bySignalType = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    if (entry.resultStatus === "pending") continue;

    const existing = bySignalType.get(entry.signalType) ?? [];
    existing.push(entry);
    bySignalType.set(entry.signalType, existing);
  }

  return Array.from(bySignalType.entries()).map(([signalType, group]) => {
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    const matchCounts = new Map<string, number>();
    for (const entry of group) {
      const base = baseMatchId(entry.matchId);
      matchCounts.set(base, (matchCounts.get(base) ?? 0) + 1);
    }

    const largestMatchCount = Math.max(...matchCounts.values());

    return {
      signalType,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
      distinctMatchCount: matchCounts.size,
      largestMatchSharePct: Math.round((largestMatchCount / group.length) * 100),
    };
  });
}
