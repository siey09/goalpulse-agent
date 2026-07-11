# P1 Tier 3, P1-7: Event-to-Signal Latency (Proxy Metric)

**Date:** 2026-07-11
**Status:** Approved

## Problem

P1-7's original ask was "event-to-market reaction latency metrics
(event received → market first moved → adjustment completed →
expected vs observed shift)." Investigating the real data before
building anything found this literal 4-stage pipeline needs
infrastructure that doesn't exist: a raw field-event stream and a raw
odds-tick stream, correlated and scanned in sequence (architecturally
closer to `steamDetection.ts`'s sequence-scanning than
`signalEngine.ts`'s single-tick comparison), plus a real-data-calibrated
"expected shift" baseline (its own P1-2-style investigation before
inventing any expected-magnitude numbers). Comparable scope to P1-1,
likely larger given the calibration step.

**User chose the smaller, already-available proxy metric instead.**
`logic/scoresContextFreshness.ts`'s `computeFreshnessTightness`
already computes, per-signal, the gap between a TXODDS Scores event's
timestamp and the odds tick it got attached to (using `Math.abs()`,
since the two feeds are independently polled and don't align
perfectly) — that data already exists on every archived signal via
`evidence.scoresContext.timestamp` and `evidence.currentTimestamp`.
This item aggregates it into a summary metric.

**Investigated against real archive data (2026-07-11, 633
`created`-event archived signals):** 314 (50%) have both timestamps
present. Median gap 3.6s. **102/314 (32%) show a negative gap** — the
event timestamp technically after the tick. This is not the market
reacting before the event; it's a polling-alignment artifact between
the two independently-polled feeds (TXODDS Scores, TxLINE odds), the
exact same reason `isScoresContextFresh`/`computeFreshnessTightness`
already use `Math.abs()`. This metric surfaces that fraction honestly
rather than hiding it.

**Explicitly not the real thing:** this measures "gap between
whichever event ended up attached to a signal and that signal's own
tick," not "how long did the market take to first move after a real
field event." Named and documented accordingly, everywhere it appears
(code comment, API response, frontend copy).

## Backend

New `logic/eventLatency.ts`:

```typescript
export interface EventLatencySummary {
  sampledCount: number;
  medianGapMs: number;
  p25GapMs: number;
  p75GapMs: number;
  negativeGapCount: number;
  negativeGapPct: number;
}

export function summarizeEventLatency(entries: ArchiveEntry[]): EventLatencySummary | null
```

Filters to entries with both `evidence.scoresContext.timestamp` and
`evidence.currentTimestamp` present (most archived signals predate
having both fields reliably, same "entries without X are excluded
entirely" precedent as `summarizeConfidenceScorePerformance`). Gap is
`|currentTimestamp - scoresContext.timestamp|` in ms. Returns `null`
(not a zeroed/placeholder object) when zero qualifying entries exist.
`negativeGapCount`/`negativeGapPct` computed from the pre-`abs()` sign,
reported alongside the (always-positive) percentile stats.

New route `GET /api/signal-performance/event-latency` (same family as
the existing `/api/signal-performance`/`/api/signal-performance/by-confidence`),
querying `getArchivedSignals({ event: "created" }, { page: 1, pageSize: 500 })`
— `"created"`, not `"settled"`, since timing data exists independent of
whether the signal's bet eventually won, and using `"created"` avoids
double-counting each signal's two archive rows (created + settled,
same `signal_data` snapshot, same timestamps).

## Frontend

Added as a new section within the existing `SignalPerformancePanel.tsx`
(not a new standalone panel — this is a single summary stat, not a
per-bucket breakdown, so a new panel would be disproportionate to its
size), below the existing accuracy grid. Shows median/p25/p75 gap in
seconds, and the negative-gap caveat as visible text, not a tooltip:
e.g. "32% of samples show a negative gap — a feed-polling artifact
between TXODDS Scores and TxLINE odds, not the market reacting before
the event." Empty state ("No signals with both timestamps yet") when
`summarizeEventLatency` returns `null`.

## Testing

Unit tests on `summarizeEventLatency`: a positive-gap entry, a
negative-gap entry (confirms `negativeGapCount` increments and the
reported gap is still the absolute value), entries missing either
timestamp excluded from the sample, empty/all-excluded input returns
`null`, percentile calculation correctness on a small known set.

## Out of scope

- The real 4-stage "event received → market first moved → adjustment
  completed → expected vs observed shift" pipeline — confirmed too
  large to build now; this proxy metric is a deliberate, honestly-labeled
  substitute, not a first phase of it.
- Any other remaining rollout item (P1-16, revisits, mandatory tests,
  Definition of Done) — each gated individually per the user's explicit
  sequencing.
