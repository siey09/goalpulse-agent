# Steam Move Detection Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem / redefinition

The original ask was to detect odds moving "rapidly and in the same
direction across multiple books/lines close together in time." Verified via
TxLINE's official docs (txline.txodds.com/documentation/odds/overview):
TxLINE's odds feed is powered by "Stable Price," TxODDS' own consensus
pricing engine — lines from global operators are already blended into a
single price before reaching this API. `evidence.bookmaker` is effectively
a single consensus value, not genuine multi-bookmaker data. Cross-book
steam detection as literally described is not buildable with real data
here (confirmed fact, recorded in `PROJECT_STATE.md`'s Architecture
section — do not re-investigate).

**Redefined "steam" for this single-consensus feed:** sustained
same-direction pressure across a *sequence* of consecutive odds ticks,
within a short time window — distinct from what the existing signal
engine already does, which only ever compares exactly two snapshots
(current vs. the one immediately before it). A single large compression
event and three-in-a-row smaller moves in the same direction are
different patterns worth distinguishing, even though today's engine
would only ever see the former as a "signal" and the latter as noise.

## Detection rule

- **Minimum consecutive same-direction moves:** 3. Distinguishes sustained
  pressure from a single compression pair (already caught by the existing
  engine) without being so strict it rarely fires.
- **Minimum per-move size:** ≥1% compression each. Filters pure
  rounding/floating-point noise while still counting genuinely small but
  consistent moves that a single-pair check (which only fires at 4%+ for
  even a LOW signal) would call "nothing happened."
- **Time window:** all ticks in the run must span ≤5 minutes from first to
  last. Reuses the same constant already established as this codebase's
  "short window" precedent (`feedHealth.ts`'s `ODDS_STALE_THRESHOLD_MS`).
- Detection looks only at the **trailing** run (the most recent
  consecutive streak) — this is a live diagnostic answering "is a steam
  move happening right now," not a historical scan for streaks buried
  anywhere in a match's full tick history.
- Applies independently to the home side and the away side of a match/line
  (whichever currently has an active trailing streak); at most one
  `SteamMove` per side per match.
- Applies to both 1X2 and Over/Under totals lines — no exclusion needed,
  same reasoning as the Market Maker confirmation cross-check: this only
  needs one side's own tick history, no opposing-side complexity.

## Architecture: new dedicated endpoint, computed live

Matches every other new capability this session (Arena, Feed Health,
Market Maker Confirmations) rather than injecting a new signal type into
`agent.ts`'s core signal-generation loop. A new signal type would touch
the `AgentSignal` type, the signal-creation loop, archiving, settlement,
and Arena/PnL — real risk to a pipeline that's been stable and fully
tested all session, for a feature whose value is "is this happening right
now," not "should this become a permanent audited signal." `GET
/api/steam-moves` is read-only, computed live from `store.oddsSnapshots`,
never mutates `agent.ts`/`store.ts`'s state.

## Implementation

New pure module, `apps/api/src/logic/steamDetection.ts`:

```typescript
export interface SteamMove {
  matchId: string;
  match: string;
  side: TeamSide;
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
}

export function detectSteamMove(snapshots: OddsSnapshot[]): SteamMove | null;
```

`detectSteamMove` takes every stored snapshot for a single `matchId`
(unsorted order is fine — it sorts internally by `createdAt`), and derives
`matchId`/`match` display fields directly from the snapshots themselves
(`snapshot.matchLabel ?? "${snapshot.homeTeam} vs ${snapshot.awayTeam}"`) —
**no separate `Match` lookup needed**, which sidesteps the totals-matchId
suffix problem entirely (a totals snapshot's own `homeTeam`/`awayTeam`
fields already carry the repurposed "Over 3.5"/"Under 3.5" labels; a
`Match` object looked up by the totals-suffixed `matchId` wouldn't resolve
without the same base-fixture-id-stripping fallback `store.ts`'s
settlement logic already needs elsewhere — unnecessary complexity when the
snapshot data is already self-sufficient).

Internally, it checks the home side and away side independently, each via
a `findSteamForSide` helper that walks the sorted snapshot list backward
from the most recent tick, extending the run while each consecutive pair's
compression is ≥1%, stopping at the first pair that isn't. If the
resulting run has ≥3 qualifying moves *and* the elapsed time from the
run's first to last tick is ≤5 minutes, it returns a `SteamMove`;
otherwise `null`. `detectSteamMove` returns whichever side detected a
steam move (checking home first, then away) — a match with sustained
movement on both sides simultaneously is not expected in practice given
how compression is calculated (one side's odds shortening is the market's
main signal), so returning at most one per match/tick-set call keeps the
per-match reporting simple; the route calls this once per matchId group.

## New endpoint: `GET /api/steam-moves`

Groups `store.oddsSnapshots` by `matchId` (this groups totals lines
separately from 1X2, matching the existing multi-market isolation
convention — no snapshot ever needs cross-referencing against a `Match`
object for this feature), calls `detectSteamMove` per group, and collects
non-null results.

```json
{
  "data": [
    {
      "matchId": "wc-usa-bra",
      "match": "USA vs Brazil",
      "side": "home",
      "tickCount": 3,
      "totalMovePct": 6.2,
      "windowMs": 184000,
      "firstOdds": 1.8,
      "lastOdds": 1.69,
      "firstTickAt": "2026-07-08T10:41:00.000Z",
      "lastTickAt": "2026-07-08T10:44:04.000Z"
    }
  ],
  "summary": {
    "matchesScanned": 9,
    "steamMovesDetected": 1
  }
}
```

Public GET, no API key, covered by the existing general rate limiter —
same as every other GET route.

## Testing

Unit tests for `detectSteamMove` against plain `OddsSnapshot` arrays (no
mocking, no I/O): no steam (fewer than 3 qualifying consecutive moves),
steam detected on the home side, steam detected on the away side, a
qualifying streak whose first-to-last tick span exceeds the 5-minute
window (should not count), a streak broken by one non-qualifying move
partway through followed by fresh qualifying moves (only the trailing run
after the break should count), and too few snapshots overall to evaluate.

## Docs

`openapi.yaml` gets a new `/api/steam-moves` path plus schemas for the
response shape above.

## Out of scope (explicitly deferred)

- No dashboard panel — backend-only, matching the established pattern.
- No change to the existing signal engine's own severity classification —
  this is a wholly separate, additive diagnostic.
- No cross-book/multi-bookmaker detection — confirmed not buildable with
  this integration's data (see "Problem / redefinition" above).
- No historical scan for steam runs buried earlier in a match's tick
  history — only the trailing (most recent) run is reported.
