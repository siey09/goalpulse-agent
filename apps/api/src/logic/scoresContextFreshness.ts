export const SCORES_CONTEXT_TOLERANCE_MS = 60_000;

/**
 * A single scoresContext is computed once per poll and would otherwise be
 * stamped onto every odds tick selected that poll, including ticks
 * selectMovementOdds reaches back for from well outside the recent window.
 * When a tick's own timestamp is too far from the context's timestamp, the
 * context no longer describes that tick's moment - omit it (fail safe)
 * rather than attach a stale, potentially wrong fieldPressureScore.
 */
export function isScoresContextFresh(
  tickTs: number | undefined,
  contextTimestamp: string | undefined,
  toleranceMs: number
): boolean {
  if (!tickTs || !contextTimestamp) return false;

  const contextMs = new Date(contextTimestamp).getTime();
  return Math.abs(tickTs - contextMs) <= toleranceMs;
}

/**
 * Graduated companion to isScoresContextFresh: instead of a pass/fail
 * gate, reports how tight the gap actually is on a 0-100 scale - a
 * context that arrived instantly scores 100, one right at the tolerance
 * boundary scores 0. Used by signalEngine.ts's confidenceScore, which
 * cares about degree of freshness, not just whether the existing gate was
 * passed. Only returns null when the inputs themselves are missing
 * (matching isScoresContextFresh's own null-condition precedent) - any
 * computable gap, however large, clamps to 0 rather than going negative.
 */
export function computeFreshnessTightness(
  tickTs: number | undefined,
  contextTimestamp: string | undefined,
  toleranceMs: number
): number | null {
  if (!tickTs || !contextTimestamp) return null;

  const contextMs = new Date(contextTimestamp).getTime();
  const gapMs = Math.abs(tickTs - contextMs);

  return Math.max(0, 100 - (gapMs / toleranceMs) * 100);
}
