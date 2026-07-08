# Retroactive Arena Backtesting Against the Archive

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

`GET /api/arena` runs Momentum Follower, Contrarian, and Kelly Criterion
against `store.signals` — capped at 100, ephemeral, lost on restart and as
matches age out of TxLINE's own live rotation window. There is no way to
see how these strategies would have performed across the *entire*
archived history the insert-only `signal_archive` table (item #1)
already accumulates.

## Architectural constraint: Contrarian cannot be reconstructed

`buildContrarianPosition(signal, match, originalSnapshot)` needs the raw
match's final score (`match.homeScore`/`match.awayScore`) to resolve the
opposing side's outcome — `resolveOpposingResult`'s own comment explains
why: if the original signal's `resultStatus` was `"incorrect"`, that's
ambiguous between "the opposing side won" and "the match was a draw"
(where the opposing side also loses), and only the real score
disambiguates. Checked `ArchiveEntry` and `AgentSignal`'s full shapes:
neither ever captures the match's final score, only each signal's own
`resultStatus`. **Confirmed with the user:** backtest only Momentum
Follower and Kelly Criterion, both of which need nothing beyond fields
already present on the archived signal itself (`side`, `target`,
`oddsAfter`, `resultStatus`, `confidenceScore`) — no schema change to the
already-shipped, insert-only archive table. Contrarian is explicitly
excluded, with the reason surfaced in the response, not silently dropped.

## Implementation

New pure module, `apps/api/src/logic/backtest.ts`:

```typescript
import { AgentSignal, ArenaScoreboard } from "../types";
import {
  buildKellyCriterionPosition,
  buildMomentumFollowerPosition,
  summarize,
} from "./arena";

export function computeBacktestScoreboards(
  archivedSignals: AgentSignal[]
): { momentumFollower: ArenaScoreboard; kellyCriterion: ArenaScoreboard } {
  const momentumPositions = archivedSignals
    .map(buildMomentumFollowerPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  const kellyPositions = archivedSignals
    .map(buildKellyCriterionPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    kellyCriterion: summarize("kelly_criterion", "Kelly Criterion", kellyPositions),
  };
}
```

`arena.ts`'s existing `summarize` function is exported (currently private)
so it's reused rather than duplicated — the exact same aggregation logic
(net units, ROI, win rate) already tested for the live endpoint applies
identically here, since both feed it the same `ArenaPosition[]` shape.

**Route**: `GET /api/arena/backtest` — named to avoid confusion with the
pre-existing, unrelated `GET /api/replay/backtest` (which replays a single
signal's Outcome Audit council vote, a different concept entirely). Calls
`getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 })` —
the same single bounded 500-row fetch already established by
`GET /api/signal-performance`, for the same reason (no server-side
aggregation needed, and this tournament's realistic data volume won't
exceed it) — maps each returned entry to its `signalData`, and passes that
array to `computeBacktestScoreboards`. Public GET, no API key, covered by
the existing general rate limiter. Fail-open inherited automatically from
`getArchivedSignals` (empty scoreboards, not an error, if Supabase is
unconfigured).

```json
{
  "data": {
    "momentumFollower": { "agentId": "momentum_follower", "label": "Momentum Follower", "positions": [], "settledCount": 12, "correctCount": 8, "incorrectCount": 4, "winRatePct": 67, "netUnits": 3.2, "roiPercent": 26.67, "openPositions": 0 },
    "kellyCriterion": { "agentId": "kelly_criterion", "label": "Kelly Criterion", "positions": [], "settledCount": 12, "correctCount": 8, "incorrectCount": 4, "winRatePct": 67, "netUnits": 2.1, "roiPercent": 18.3, "openPositions": 0 }
  },
  "summary": { "archivedSignalsScanned": 40 },
  "note": "Contrarian is excluded from backtesting: the archive stores each signal's own resultStatus but not the match's final score, so Contrarian's opposing-side outcome (win vs. draw) can't be reconstructed from archived data alone."
}
```

## Docs

`openapi.yaml` gets a new `/api/arena/backtest` path plus a schema
reusing the existing `ArenaScoreboard` schema for both fields.

## Testing

- `computeBacktestScoreboards` (new, `logic/backtest.test.ts`): empty
  input; multiple archived signals aggregate correctly into both
  scoreboards (hand-verified net units/ROI, reusing the same math already
  verified for `summarize` in `arena.test.ts`); totals signals excluded
  (inherited automatically from `buildMomentumFollowerPosition`/
  `buildKellyCriterionPosition`'s own `isTotalsSignal` checks — a
  regression check that this orchestration function doesn't need its own
  redundant filtering logic); a signal missing `confidenceScore` doesn't
  crash Kelly's backtest (treated as zero edge, per the existing
  behavior).
- No new tests needed for `buildMomentumFollowerPosition`/
  `buildKellyCriterionPosition` themselves — this feature only
  orchestrates already-tested functions against a different signal
  source, it does not change their behavior.

## Out of scope (explicitly deferred)

- No Contrarian backtesting, and no archive schema change to enable it —
  confirmed with the user (see above). A future item could revisit this
  if a genuine need arises, but only newly-archived signals going forward
  would have the data even if the schema changed today; existing archived
  rows would remain unbacktestable for Contrarian regardless.
- No side-by-side comparison against the live `/api/arena` (capped-100,
  in-memory) scoreboards in the same response — this endpoint is
  backtest-only; comparing live vs. historical is a distinct feature a
  user could build by calling both endpoints themselves.
- No dashboard panel — backend-only, matching the established pattern.
- No full-archive pagination — a single bounded 500-row fetch, same
  precedent as `GET /api/signal-performance`.
