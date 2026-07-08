# Pattern-Matched Signal Correlation Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation plan

## Problem

`GET /api/signal-correlation` (item #6, built earlier this session)
already detects cross-match signal clusters by pure time proximity: any
signals firing within 5 minutes of each other across 2+ matches count,
regardless of what those signals actually say. Confirmed live in
production right now: real clusters mix HIGH/MEDIUM/LOW severity and
1x2/totals signals freely within the same window. That's useful for
spotting "something is happening across the tournament right now," but
it doesn't answer a narrower, stronger question: is the *same betting
pattern* — same direction, same severity, same market — repeating across
multiple matches at once? That's a materially different, more specific
signal worth its own detection pass, not a filter bolted onto the
existing one (which would rarely fire, given how mixed real clusters
already are).

## Pattern definition

A signal's **pattern key** is the tuple `(side, severity, market)`:
- `side`: `"home"` or `"away"` — directly the field already on
  `AgentSignal`, and what "direction" means here.
- `severity`: `"HIGH" | "MEDIUM" | "LOW"` (a signal's own `severity`
  field; `"NONE"`-severity signals are never persisted to `store.signals`
  in the first place, so this case doesn't arise).
- `market`: `"1x2" | "totals"`, via the existing `isTotalsSignal(signal)`
  classifier already used by `arena.ts`/`archive.ts` — reused rather than
  reinvented.

`signalType` is deliberately excluded from the pattern key: it's already
a deterministic function of `severity` in `signalEngine.ts`
(`HIGH→SHARP_MOVE`, `MEDIUM→MOMENTUM_SHIFT`, `LOW→WATCH`), so including
both would double-count the same underlying axis.

## Algorithm

Reuses the same 5-minute `CORRELATION_WINDOW_MS` and the same
2-or-more-distinct-`matchId` requirement as the existing feature — this
is genuinely the same concept of "cross-match correlation," just with an
added homogeneity constraint. The existing `findSignalClusters`'s
session-windowing loop (sort by `createdAt`, start a new group whenever
the gap to the previous signal exceeds the window) is extracted into a
shared, exported helper:

```typescript
function sessionWindowGroups<T>(
  items: T[],
  getTimestamp: (item: T) => string,
  windowMs: number
): T[][]
```

Both the existing `findSignalClusters` and the new
`findPatternMatchedClusters` use this helper. The new function:

1. Groups all signals by pattern key.
2. Within each pattern-key group, applies `sessionWindowGroups` (same
   algorithm, same window).
3. Filters to windows spanning 2+ distinct `matchId`s.

This finds cases where the *same* pattern repeats across matches within
the window — not just "anything happened nearby," which the existing
feature already covers. A time window where 3 matches independently
produce HIGH/home/1x2 signals within 5 minutes of each other is a
pattern-matched cluster; a window mixing HIGH/home and LOW/away signals
across matches is not (each pattern's own signals are considered
separately, and if none reaches 2+ matches on its own, no cluster is
reported for that window at all).

## New endpoint: `GET /api/signal-correlation/patterns`

Confirmed with the user: a new nested route, not a field added to the
existing endpoint — mirrors this session's own `GET /api/arena/backtest`
nesting precedent, keeps the two genuinely different detection algorithms
(time-proximity vs. pattern-match) as separate contracts.

```typescript
export interface PatternCluster {
  side: "home" | "away";
  severity: Severity;
  market: "1x2" | "totals";
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
}

export function findPatternMatchedClusters(
  signals: AgentSignal[],
  windowMs: number
): PatternCluster[];
```

Computed live at request time from `store.signals`, same as the existing
correlation endpoint — never mutates `agent.ts`/`store.ts`'s state, zero
changes to the core synchronous signal-creation pipeline.

```json
{
  "data": [
    {
      "side": "home",
      "severity": "HIGH",
      "market": "1x2",
      "matchIds": ["wc-usa-bra", "wc-jpn-esp", "wc-fra-ger"],
      "matchCount": 3,
      "signalCount": 3,
      "windowStart": "2026-07-09T14:00:00.000Z",
      "windowEnd": "2026-07-09T14:03:00.000Z",
      "spanMs": 180000,
      "signalIds": ["signal-abc", "signal-def", "signal-ghi"]
    }
  ],
  "summary": {
    "signalsScanned": 100,
    "patternClustersDetected": 1
  }
}
```

Public GET, no API key, covered by the existing general rate limiter —
same as every other GET route this session.

## Testing

- `sessionWindowGroups` (new, extracted, tested independently since both
  callers now depend on it): basic grouping, chained gaps each under the
  window producing one long group, a gap exceeding the window splitting
  into separate groups.
- `findSignalClusters` (existing): re-run unchanged after the refactor to
  confirm it's 100% behavior-preserving — same expected outputs as its
  existing tests, now computed via the shared helper.
- `findPatternMatchedClusters` (new): no cluster when only one match
  shares a pattern; a genuine 2+-match pattern cluster within the window;
  two different patterns in the same time window each independently
  evaluated (one reaching 2+ matches and reported, the other not); market
  correctly distinguishes 1x2 from totals signals that otherwise share
  side+severity; the existing chained-gap and idle-gap session-windowing
  behaviors carry over correctly through the shared helper.

## Docs

`openapi.yaml` gets a new `/api/signal-correlation/patterns` path plus a
schema for the response shape above.

## Out of scope (explicitly deferred)

- No dashboard panel — backend-only, matching the established pattern
  for read-derived features this session (only the Signal Archive panel
  broke that pattern, per explicit user prioritization).
- No change to the existing `GET /api/signal-correlation` endpoint's
  response shape or behavior — purely additive.
- No causal interpretation of *why* the same pattern repeats across
  matches (coordinated market activity vs. coincidence vs. a shared
  external event) — this spec only detects and reports the pattern, same
  scope boundary as the existing correlation feature.
