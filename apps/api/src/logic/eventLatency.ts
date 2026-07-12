import type { ArchiveEntry } from "../types";

export interface EventLatencySummary {
  sampledCount: number;
  medianGapMs: number;
  p25GapMs: number;
  p75GapMs: number;
  negativeGapCount: number;
  negativeGapPct: number;
}

/**
 * Proxy metric only - NOT the real "event received -> market first
 * moved -> adjustment completed -> expected vs observed shift"
 * pipeline. That would require a raw field-event stream and a raw
 * odds-tick stream, correlated and scanned in sequence (closer to
 * steamDetection.ts's approach than a single-tick comparison), plus a
 * real-data-calibrated expected-shift baseline.
 *
 * This instead aggregates the gap scoresContextFreshness.ts already
 * computes per-signal (with Math.abs(), for the same reason as here)
 * between evidence.scoresContext.timestamp (whichever TXODDS Scores
 * event ended up attached to the signal) and evidence.currentTimestamp
 * (the odds tick that triggered it). A real fraction of these gaps are
 * negative - the event timestamp technically after the tick. This is
 * NOT the market reacting before the event; TXODDS Scores and TxLINE
 * odds are two independently-polled feeds that don't align perfectly
 * in time. Reported honestly via negativeGapCount/negativeGapPct,
 * never filtered out.
 */
export function summarizeEventLatency(entries: ArchiveEntry[]): EventLatencySummary | null {
  const gaps: number[] = [];
  let negativeGapCount = 0;

  for (const entry of entries) {
    const eventTimestamp = entry.signalData?.evidence?.scoresContext?.timestamp;
    const tickTimestamp = entry.signalData?.evidence?.currentTimestamp;
    if (!eventTimestamp || !tickTimestamp) continue;

    const gapMs = new Date(tickTimestamp).getTime() - new Date(eventTimestamp).getTime();
    if (gapMs < 0) negativeGapCount += 1;
    gaps.push(Math.abs(gapMs));
  }

  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);

  const percentile = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];

  return {
    sampledCount: gaps.length,
    medianGapMs: percentile(0.5),
    p25GapMs: percentile(0.25),
    p75GapMs: percentile(0.75),
    negativeGapCount,
    negativeGapPct: Math.round((negativeGapCount / gaps.length) * 100),
  };
}
