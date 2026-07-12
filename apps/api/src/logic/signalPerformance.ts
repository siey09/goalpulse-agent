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
 * understating how concentrated the sample actually is.
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

export interface ConfidenceBucketPerformance {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

function confidenceBucket(score: number): ConfidenceBucketPerformance["bucket"] {
  if (score < 25) return "0-25";
  if (score < 50) return "25-50";
  if (score < 75) return "50-75";
  return "75-100";
}

const BUCKET_ORDER: ConfidenceBucketPerformance["bucket"][] = ["0-25", "25-50", "50-75", "75-100"];

/**
 * confidenceScore is designed to be more informative than raw
 * severity/signalType - it blends field pressure and freshness into the
 * score - so this buckets settled signals by that score to measure
 * whether it actually predicts accuracy. Entries without a
 * confidenceScore are excluded entirely - they carry no
 * bucketed-accuracy information. Buckets with zero settled entries are
 * omitted, not returned with a 0%/NaN placeholder.
 */
export function summarizeConfidenceScorePerformance(
  entries: ArchiveEntry[]
): ConfidenceBucketPerformance[] {
  const byBucket = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    if (entry.resultStatus === "pending") continue;

    const score = entry.signalData?.confidenceScore;
    if (typeof score !== "number") continue;

    const bucket = confidenceBucket(score);
    const existing = byBucket.get(bucket) ?? [];
    existing.push(entry);
    byBucket.set(bucket, existing);
  }

  return BUCKET_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => {
    const group = byBucket.get(bucket)!;
    const correctCount = group.filter((entry) => entry.resultStatus === "correct").length;
    const incorrectCount = group.length - correctCount;

    return {
      bucket,
      settledCount: group.length,
      correctCount,
      incorrectCount,
      accuracyPct: Math.round((correctCount / group.length) * 100),
    };
  });
}
