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
