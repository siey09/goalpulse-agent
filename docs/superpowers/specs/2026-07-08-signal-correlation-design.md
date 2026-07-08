# Signal Correlation Across Simultaneous Matches Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

The World Cup regularly has multiple matches live at once. Nothing today
detects or surfaces when signals fire across *several different matches*
close together in time — a distinct pattern from a single match's own
signal history, and one the existing signal engine (which only ever
reasons about one match's odds history) has no visibility into.

## Definition: a "cluster"

A cluster is built via session-windowing over the *entire* stored signal
history (`store.signals`, capped 100) — not just the trailing run (unlike
steam detection): sort all signals by `createdAt`, then walk them in
order, starting a new cluster whenever the gap to the previous signal in
the current cluster exceeds a 5-minute window (reusing the same "short
window" constant already established twice this session — `feedHealth.ts`'s
`ODDS_STALE_THRESHOLD_MS`, `steamDetection.ts`'s `STEAM_WINDOW_MS`). A
steady trickle of correlated signals can therefore span longer than 5
minutes in total, as long as no single gap between consecutive signals
exceeds it (a standard "session window" pattern).

A cluster only counts as a genuine cross-match correlation if it spans
**2 or more distinct `matchId`s**. A single match firing multiple signals
in a row within 5 minutes is normal, already-covered signal-engine
behavior — nothing new to flag. `store.signals` spans potentially hours
of history even at its 100-entry cap, so multiple distinct clusters at
different points in that history can all exist and are all reported, not
just the most recent one.

**No severity or signal-type filtering required to join a cluster.** A
HIGH-severity signal in one match and a LOW-severity signal in another,
firing within the same window, is still a genuine "multiple matches
moving at once" event worth surfacing — filtering to only matching
severities would arbitrarily narrow the feature without real justification.
Instead, each cluster's output includes a severity breakdown so a
consumer can judge significance themselves.

## Implementation

New pure module, `apps/api/src/logic/signalCorrelation.ts`:

```typescript
export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

export interface SignalCluster {
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  severityBreakdown: { high: number; medium: number; low: number };
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
}

export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[];
```

Algorithm: sort signals ascending by `createdAt`; walk the sorted list,
appending each signal to the current in-progress group if the gap to the
*previous* signal in that group is `<= windowMs`, otherwise closing the
current group and starting a new one with this signal. After grouping,
filter to groups whose signals span 2+ distinct `matchId`s, and map each
qualifying group into a `SignalCluster` (`matchIds` deduplicated,
`severityBreakdown` counted from each signal's `severity`, `windowStart`/
`windowEnd` from the first/last signal's `createdAt`, `spanMs` the
difference between them).

## New endpoint: `GET /api/signal-correlation`

Matches this session's established one-route-per-capability pattern.
Computed live at request time from `store.signals`; never mutates
`agent.ts`/`store.ts`'s state.

```json
{
  "data": [
    {
      "matchIds": ["wc-usa-bra", "wc-jpn-esp"],
      "matchCount": 2,
      "signalCount": 3,
      "severityBreakdown": { "high": 1, "medium": 1, "low": 1 },
      "windowStart": "2026-07-08T14:00:00.000Z",
      "windowEnd": "2026-07-08T14:03:30.000Z",
      "spanMs": 210000,
      "signalIds": ["signal-abc", "signal-def", "signal-ghi"]
    }
  ],
  "summary": {
    "signalsScanned": 40,
    "clustersDetected": 2
  }
}
```

Public GET, no API key, covered by the existing general rate limiter —
same as every other GET route.

## Testing

Unit tests for `findSignalClusters` against plain `AgentSignal` arrays (no
mocking, no I/O): no cluster (signals all from the same single match, no
matter how close in time), no cluster (signals from different matches but
too far apart in time), a genuine 2-match cluster within the window, a
cluster spanning more than 5 minutes total via chained gaps each
individually under 5 minutes (the session-windowing behavior), two
separate clusters correctly identified from a longer signal history with
an idle gap between them, and a mixed-severity cluster's
`severityBreakdown` counted correctly.

## Docs

`openapi.yaml` gets a new `/api/signal-correlation` path plus schemas for
the response shape above.

## Out of scope (explicitly deferred)

- No dashboard panel — backend-only, matching the established pattern.
- No causal interpretation of *why* matches correlate (news event,
  data-quality artifact, genuine coordinated market activity, or simple
  coincidence) — this spec only detects and reports the pattern, it does
  not classify or explain it.
- No change to the existing signal engine — wholly additive, read-only.
- No minimum total signal count beyond "2+ distinct matches" — a cluster
  of exactly 2 matches with 1 signal each is already a meaningful minimal
  case.
