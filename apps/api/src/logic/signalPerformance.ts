import type { ArchiveEntry } from "../types";

export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
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

    return {
      signalType,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
    };
  });
}
