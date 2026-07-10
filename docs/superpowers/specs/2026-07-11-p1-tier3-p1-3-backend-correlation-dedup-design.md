# P1 Tier 3, P1-3: Backend Signal-Correlation Dedup

**Date:** 2026-07-11
**Status:** Approved

## Problem

`logic/signalCorrelation.ts`'s `findSignalClusters` and
`findPatternMatchedClusters` count raw `signal.matchId` when building
`matchIds`/`matchCount` and when filtering for "2+ distinct matches."
A totals signal's `matchId` is `<fixtureId>-totals-<line>` (see
`isTotalsMatchId` in `services/archive.ts`), so one real match firing
across several of its own totals lines is currently reported as a
false multi-match cluster.

This was found and worked around client-side on 2026-07-10, in two
separate places, as a deliberate lower-risk tradeoff given time
pressure at the time:
- `SignalCorrelationPanel.tsx`'s local `baseMatchId`/`distinctRealMatches`
  functions and a `.filter(cluster => realMatchIds.length >= 2)` guard.
- `App.tsx`'s analyst-chat handler, which independently re-implements
  the identical `baseMatchId` pattern and dedup logic for its own
  "signal correlation clusters?" chat answer.

The backend-correct fix was explicitly deferred at the time, documented
in `PROJECT_STATE.md` as reusing the exact `baseMatchId` pattern already
proven in `logic/signalPerformance.ts`
(`matchId.split("-totals-")[0]`). Re-verified during this Tier 3
brainstorm that the decision to defer still holds (nothing about the
underlying data shape has changed) — this spec is that deferred fix,
now being implemented.

## Backend fix — `logic/signalCorrelation.ts`

Add a local `baseMatchId` function, matching the exact implementation
already used in `signalPerformance.ts` (duplicated per this codebase's
established convention of small, independently-testable logic modules
rather than sharing an import across files):

```typescript
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}
```

`buildCluster` (used by `findSignalClusters`) and `buildPatternCluster`
(used by `findPatternMatchedClusters`) both currently build `matchIds`
by deduping on the raw `signal.matchId`:

```typescript
for (const signal of group) {
  if (!seenMatchIds.has(signal.matchId)) {
    seenMatchIds.add(signal.matchId);
    matchIds.push(signal.matchId);
  }
  ...
}
```

Both switch to deduping on `baseMatchId(signal.matchId)` instead, so
`matchIds` now holds distinct real-match ids (the base fixture id, no
totals-suffix duplicates). `matchCount` (`matchIds.length`) is correct
by construction once this changes — no separate fix needed there.

`findSignalClusters`'s and `findPatternMatchedClusters`'s "2+ distinct
matches" filters currently read:

```typescript
new Set(group.map((signal) => signal.matchId)).size >= 2
```

Both switch to:

```typescript
new Set(group.map((signal) => baseMatchId(signal.matchId))).size >= 2
```

**This is an in-place semantics change to `matchIds`/`matchCount` on
both `GET /api/signal-correlation` and
`GET /api/signal-correlation/patterns`** — approved by the user as the
correct approach (matches the exact precedent in
`signalPerformance.ts`'s `distinctMatchCount`, which replaced raw
counting outright rather than keeping dual fields; no other consumer
depends on the raw totals-suffixed form).

Both functions get this fix, not just `findPatternMatchedClusters`
(which has the only current frontend consumer) — `findSignalClusters`
has the identical flaw, and `/api/signal-correlation` is judge-visible
via `/api/docs`, so leaving it inconsistent with its sibling endpoint
would be a real (if lower-visibility) correctness gap.

## Frontend simplification

**`SignalCorrelationPanel.tsx`:** delete the local `baseMatchId`,
`distinctRealMatches`, and the `GenuineCluster` type entirely. The
component currently maps `PatternCluster[]` into
`GenuineCluster[]` (adding a computed `realMatchIds` field) and filters
to `realMatchIds.length >= 2`; both the mapping and the filter are
removed since `cluster.matchIds`/`cluster.matchCount` from the API
response are now already correct and every returned cluster already
qualifies. The component renders `cluster.matchIds` directly instead
of `cluster.realMatchIds` (rename at each JSX usage site).

**`App.tsx`'s analyst-chat handler:** delete the local `baseMatchId`
function and its two call sites in the correlation-question branch
(`new Set(cluster.matchIds.map(baseMatchId)).size >= 2` for the
overall filter, and `new Set(top.matchIds.map(baseMatchId)).size` for
the reported count) — both collapse to using `cluster.matchIds`/
`cluster.matchCount`/`clusters.length` directly, since the API-side
data is already deduped and pre-filtered.

## Testing

New tests in `signalCorrelation.test.ts`, one per affected function:

- `findSignalClusters`: two totals-suffixed matchIds from the *same*
  real match (e.g. `fixture-1-totals-2.5` and `fixture-1-totals-3.5`,
  same underlying fixture) must **not** produce a cluster, even though
  they're two distinct raw `matchId` strings.
- `findPatternMatchedClusters`: same same-match/different-totals-line
  case must not produce a cluster; a genuine cross-match case (two
  different real fixtures, one totals signal each, same
  side/severity/market) must report deduped `matchIds`
  (`[fixtureA, fixtureB]`) and `matchCount: 2`.

All existing tests in this file use plain `match-1`/`match-2`-style ids
with no `-totals-` suffix, so `baseMatchId` is a no-op on every one of
them — zero regression risk expected, all should stay green unchanged.

**Frontend:** no test runner in this project (consistent with every
other frontend change this session) — verified manually. The user will
independently verify live in production post-merge: the Signal
Correlation panel and the "signal correlation clusters?" chat answer
both still show correct, real clusters now that the backend owns
deduping.

## Out of scope

- Any other Tier 3 item (P1-2, P1-1, P1-7, P1-16) — this spec covers
  P1-3 only, sequenced first per the user's explicit cost/benefit
  ordering.
- `signalEngine.ts`'s or `agent.ts`'s signal-generation logic — this is
  a pure read-side aggregation fix, no change to how signals are
  created, stored, or which ones exist.
