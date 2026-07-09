# Confidence-Bucketed Signal Performance Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation plan

## Problem

`confidenceScore` (item #7) was designed to be a more informative signal
than raw `severity`/`signalType` — it blends compression magnitude with
field pressure and freshness, specifically to catch cases like the one
found during the SHARP_MOVE investigation (a large compression with a
field-pressure/direction mismatch that failed). But nothing currently
*measures* whether it actually is more predictive. `GET /api/signal-performance`
buckets by `signalType` only.

## Confirmed data gap (surfaced to and accepted by the user before building)

`confidenceScore` is absent from all 102 currently-settled archived
signals — every one predates item #7 in the pipeline (confirmed directly:
a sample settled signal's `createdAt` is well before `confidenceScore`
existed). This feature will return an empty array today. Accepted
deliberately: cheap to build, well-tested, and fills in naturally as the
remaining ~4 tournament matches settle, without further work — the same
pattern `signal-performance` itself went through early on.

## Design

New function alongside the existing `summarizeSignalTypePerformance` in
the same file (same domain — archive-derived accuracy reporting, just a
different grouping key):

```typescript
export interface ConfidenceBucketPerformance {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

export function summarizeConfidenceScorePerformance(
  entries: ArchiveEntry[]
): ConfidenceBucketPerformance[];
```

**Bucketing:** `< 25` → `"0-25"`, `< 50` → `"25-50"`, `< 75` → `"50-75"`,
else `"75-100"`. No defensive out-of-range handling needed —
`confidenceScore` is a weighted average of components each already
clamped to 0-100, so it's mathematically guaranteed to stay in range.

**Entries without `confidenceScore`** (all current data, and any future
signal predating item #7 that somehow settles late) are excluded
entirely — same precedent as `summarizeSignalTypePerformance` excluding
`pending` entries, since a signal that can't be bucketed carries no
bucketed-accuracy information.

**Empty buckets are omitted from the output**, not returned with a 0%/NaN
placeholder — same precedent as `summarizeSignalTypePerformance`, which
only returns signal types that actually have settled data.

**Unlike `summarizeSignalTypePerformance`, buckets ARE explicitly sorted**
ascending (`0-25` → `75-100`) before returning. `signalType` has no
natural order so that function returns insertion order; confidence
buckets have an obvious natural order that's far more readable in that
order regardless of which bucket happened to be encountered first.

## New endpoint: `GET /api/signal-performance/by-confidence`

Nested under the existing `/api/signal-performance` route — mirrors this
session's established precedent (`GET /api/arena/backtest` under
`/api/arena`, `GET /api/signal-correlation/patterns` under
`/api/signal-correlation`) for a closely-related-but-distinct grouping,
rather than adding a second array to the existing response's contract.
Same bounded fetch as the existing endpoint
(`getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 })`).
Public GET, no API key, general rate limiter — same as every other route.

```json
{
  "data": [],
  "summary": { "settledSignalsScanned": 102, "bucketsReported": 0 }
}
```

(Illustrative once data exists:)

```json
{
  "data": [
    { "bucket": "25-50", "settledCount": 4, "correctCount": 3, "incorrectCount": 1, "accuracyPct": 75 },
    { "bucket": "75-100", "settledCount": 2, "correctCount": 2, "incorrectCount": 0, "accuracyPct": 100 }
  ],
  "summary": { "settledSignalsScanned": 6, "bucketsReported": 2 }
}
```

## Docs

`openapi.yaml` gets a new `/api/signal-performance/by-confidence` path.

## Testing

- Empty input → `[]` (matches the current real-world state exactly).
- Entries without `confidenceScore` are excluded entirely, even when
  otherwise settled and valid.
- A single bucket with mixed outcomes computes accuracy correctly.
- Multiple buckets are returned in ascending order regardless of input
  order.
- Boundary values (`24.9` vs `25.0`, `49.9` vs `50.0`, `74.9` vs `75.0`)
  land in the correct adjacent bucket.

## Out of scope (explicitly deferred)

- No dashboard change — backend-only, per the user's standing instruction
  not to add UI without being asked.
- No change to `summarizeSignalTypePerformance` or its existing endpoint.
- No retroactive backfill of `confidenceScore` onto pre-item-7 archived
  signals — the archive is insert-only and each row is a point-in-time
  snapshot; this is intentionally never touched after the fact.
