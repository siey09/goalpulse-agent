# Market Maker Double-Confirmation Cross-Check Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

`marketMaker.ts`'s `computeMarketMakerQuote` and `signalEngine.ts`'s
`buildSignalFromSnapshots` both compute their outputs from the same
`snapshot.evidence.scoresContext.fieldPressureScore`/`reliability` fields.
A naive cross-check comparing "does the Market Maker's spread agree with
the signal's severity" would be circular — both derive from the same
upstream input and would agree by construction, not by genuine independent
confirmation. This spec found a genuinely independent comparison instead:
the Market Maker's quote depends only on a *single* snapshot (no historical
comparison), while the signal engine's severity depends on the *change
between two* snapshots. That asymmetry is the real cross-check surface.

## The band-breach test

For a given signal, compute what the Market Maker *would have quoted* using
the **previous** snapshot (the one from before the move) — its own
bid/ask band represents what that model considered "normal quoting
uncertainty" at that point in time, independent of any knowledge that a
move was about to happen. Then check whether the signal's **current**
odds (`oddsAfter`) fell below that old quote's `bidOdds` for the signal's
side.

If it did, the move pushed the price further than the market's own
prior uncertainty allowance — real corroboration that this was a
genuine repricing event, not noise the old spread already anticipated.
If the current odds are still inside the old band, the move may be
within normal quoting noise even though the raw percentage-change
classification alone crossed a severity threshold.

This is a genuinely different signal from anything already computed:
it's not re-deriving severity from `fieldPressureScore`, it's testing
whether the move was big enough to matter *relative to the market's own
prior estimate of noise*, using the previous snapshot — which neither
`marketMaker.ts` nor `signalEngine.ts` currently uses for this purpose.

## Scope: both 1X2 and Over/Under totals signals

Unlike Arena's Contrarian agent (which needs to determine an *opposing*
side's real team name, and therefore excludes totals signals for
simplicity), this check only needs the *same* side's own historical band.
`computeMarketMakerQuote` already works identically regardless of whether
`homeOdds`/`awayOdds` represent a real team or a repurposed "Over 3.5" /
"Under 3.5" line. There's no structural reason to exclude totals here.

## Implementation

New pure module, `apps/api/src/logic/marketConfirmation.ts`, composing
`computeMarketMakerQuote` from the existing `marketMaker.ts` — keeping the
quoting model and this cross-check layer as separate, single-responsibility
modules:

```typescript
export interface BandBreachResult {
  signalId: string;
  matchId: string;
  match: string;
  side: TeamSide;
  severity: Severity;
  oddsBefore: number;
  oddsAfter: number;
  previousBandBid: number;
  previousBandAsk: number;
  bandBreached: boolean;
}

export function assessBandBreach(
  signal: AgentSignal,
  match: Match,
  previousSnapshot: OddsSnapshot
): BandBreachResult;

export interface BandBreachSummary {
  totalChecked: number;
  confirmedCount: number;
  unconfirmedCount: number;
  confirmationRatePct: number;
}

export function summarizeBandBreaches(results: BandBreachResult[]): BandBreachSummary;
```

`assessBandBreach` calls `computeMarketMakerQuote(match, previousSnapshot)`,
reads `previousQuote.bidOdds[signal.side]`/`previousQuote.askOdds[signal.side]`,
and sets `bandBreached = signal.oddsAfter < previousQuote.bidOdds[signal.side]`
— compression always means the winning side's odds got shorter (a lower
decimal value), so breaching the old *bid* (the quote's lower bound) is the
direction-consistent test.

## New endpoint: `GET /api/market-maker/confirmations`

Matches this session's established one-route-per-capability pattern (Arena,
Archive, Feed Health all got dedicated routes). Computed live at request
time from `store.signals`, `store.oddsSnapshots`, `store.matches`, and
`store.recentFinishedMatches` — never touches `agent.ts`/`store.ts`'s
mutable state.

For every signal in `store.signals`, `server.ts`'s route handler looks up
its previous snapshot via `evidence.previousSnapshotId` in
`store.oddsSnapshots`, and its match by `matchId` in `store.matches`/
`store.recentFinishedMatches` (same combined-map pattern Arena's route
already uses). A signal whose previous snapshot has aged out of the shared
800-entry cache is silently skipped — not everything is always computable,
consistent with this codebase's existing fail-soft precedent — and
`summary.totalChecked` reflects only what was actually computable.

```json
{
  "data": [
    {
      "signalId": "signal-abc",
      "matchId": "match-7",
      "match": "Colombia vs Ghana",
      "side": "home",
      "severity": "HIGH",
      "oddsBefore": 1.59,
      "oddsAfter": 1.19,
      "previousBandBid": 1.52,
      "previousBandAsk": 1.66,
      "bandBreached": true
    }
  ],
  "summary": {
    "totalChecked": 40,
    "confirmedCount": 22,
    "unconfirmedCount": 18,
    "confirmationRatePct": 55
  }
}
```

Public GET, no API key, covered by the existing general rate limiter — same
as every other GET route.

## Testing

Unit tests for both pure functions against plain objects (no mocking, no
I/O): `assessBandBreach` (a move that breaks the old band → `bandBreached:
true`, a move that stays within the old band → `false`, both home and away
sides), `summarizeBandBreaches` (mixed confirmed/unconfirmed counts, the
empty-list edge case with `confirmationRatePct: 0`).

## Docs

`openapi.yaml` gets a new `/api/market-maker/confirmations` path plus
schemas for the response shape above.

## Out of scope (explicitly deferred)

- No dashboard panel — backend-only, matching the established pattern of
  making data queryable first and deferring frontend consumption.
- No change to `computeMarketMakerQuote` itself or to signal severity
  classification — this spec only adds a new derived cross-check layer on
  top of both, it doesn't change how either already-existing output is
  computed.
- No per-severity breakdown in the summary (e.g. confirmation rate split by
  HIGH/MEDIUM/LOW) — kept to the minimal aggregate needed to answer "does
  this cross-check add real signal," not a full analytics breakdown.
