# Signal Performance Match-Diversity Metrics Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation plan

## Problem

Investigation into SHARP_MOVE's 33% accuracy (see `PROJECT_STATE.md`'s
"Open questions") found that all three signal-type accuracy figures
currently reported by `GET /api/signal-performance` are dominated by a
single match (89-100% concentration) — but nothing in the API itself
exposes this. A consumer sees "88% accuracy, 52 settled" and has no way
to tell whether that's diversified evidence or one match's outcome
without manually cross-referencing every entry's `matchId`, exactly as
this investigation had to do by hand.

## Design

Add two fields to `SignalTypePerformance`:

```typescript
export interface SignalTypePerformance {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  distinctMatchCount: number;
  largestMatchSharePct: number;
}
```

`distinctMatchCount`: how many distinct *real* matches this signal type's
settled entries span. `largestMatchSharePct`: what percentage of this
signal type's settled entries come from its single most-represented
match — a direct, reusable version of the manual concentration check just
performed.

**Totals sub-markets must collapse to their base fixture.** A signal's
`matchId` for a totals market is `<fixtureId>-totals-<line>` (e.g.
`18202783-totals-0.75`) — six different total-goals lines for the *same*
real match would otherwise count as six "distinct matches," understating
concentration in exactly the way this investigation found problematic.
A new helper extracts the base fixture ID before counting:

```typescript
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}
```

Verified against the real investigation data: SHARP_MOVE
(distinctMatchCount=3, largestMatchSharePct=89), WATCH
(distinctMatchCount=2, largestMatchSharePct=98), MOMENTUM_SHIFT
(distinctMatchCount=1, largestMatchSharePct=100) — matching the manual
findings exactly.

## Implementation

`apps/api/src/logic/signalPerformance.ts`'s `summarizeSignalTypePerformance`
computes both new fields per signal type, using the same already-settled,
already-grouped-by-signalType data it already builds — no new filtering,
no new archive query.

## Docs

`openapi.yaml`'s `/api/signal-performance` response schema gains the two
new fields.

## Testing

- A signal type where all settled signals share one match:
  `distinctMatchCount = 1`, `largestMatchSharePct = 100`.
- A signal type evenly split across two distinct matches:
  `distinctMatchCount = 2`, `largestMatchSharePct = 50`.
- Totals sub-markets of the *same* base fixture correctly collapse to one
  match, not counted as separate — the key regression-safety test proving
  this actually fixes the undercounting problem just found.
- Existing `accuracyPct`/`settledCount`/`correctCount`/`incorrectCount`
  behavior unchanged — regression-checked against the existing test file.

## Out of scope (explicitly deferred)

- No dashboard change — the existing `SignalPerformancePanel.tsx` isn't
  touched; per the user's standing instruction, no further UI work
  without being asked first.
- No change to the underlying archive query bound (still the existing
  500-row settled fetch).
