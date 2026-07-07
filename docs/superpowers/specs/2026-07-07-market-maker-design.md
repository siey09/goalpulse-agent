# In-Play Market Maker

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

GoalPulse Agent's existing signal engine detects and classifies odds movement, but
doesn't demonstrate a second, genuinely different trading capability: market making.
This is the second of three suggested hackathon feature ideas (the first, Sharp
Movement Detector, is already covered by the existing signal engine; the third,
Agent vs Agent Arena, comes after this one).

## Goals

- Quote a bid/ask spread around the current fair odds for a match's outcomes
  (home/away/draw), where the spread genuinely widens with higher uncertainty and
  narrows in calm, reliable conditions — defensible market-making logic, not an
  arbitrary number.
- Expose as a new, standalone backend endpoint, documented in `openapi.yaml`
  following existing conventions.
- Computed autonomously from already-live data (strengthens the "Autonomous
  Operation" judging criterion) — no human curates or triggers it.
- Visualized in a new frontend panel: live bid/ask quotes plus a human-readable
  reason for the current spread width.
- Must not touch or destabilize the existing signal engine, P&L, or settlement
  logic — reads the same underlying data but is a new, independent computation.

## Confirmed facts (verified against real code, not assumed)

- `fieldPressureScore` is not continuous — it is one of exactly 5 discrete values
  set in `apps/api/src/services/txlineClient.ts`'s `pressureFromAction()`:
  `NONE=0, SAFE=8, ATTACK=22, DANGER=32, HIGH_DANGER=45`.
- `reliability` (`apps/api/src/types.ts:32`) is
  `"RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN"`. **`SUSPENDED` is
  confirmed reachable, not dead code**: `reliabilityFromEvent()` in
  `txlineClient.ts:221-226` assigns it whenever `event.StatusId === 18`, an
  explicit `"suspend"` action, or an explicit `Reliable: false` flag is present,
  and this function is called for every scores event processed
  (`txlineClient.ts:285`). `UNKNOWN` means no TXODDS scores event existed at all
  for the fixture. The existing momentum score formula in `signalEngine.ts`
  penalizes `SUSPENDED` by −18 and `UNRELIABLE` by −10 (of 100) and gives
  `UNKNOWN` no penalty.
- TxLINE's odds snapshots are already a de-margined "fair" price feed (real
  captured evidence: `bookmaker: "TXLineStablePriceDemargined"` in
  `apps/web/src/data/pinnedCaseStudies.ts`) — no independent fair-value
  computation is needed; the current `OddsSnapshot.homeOdds/awayOdds/drawOdds`
  values are themselves the fair odds to quote around.
- `store.ts` already exports `findPreviousSnapshot(matchId)`, which
  filters+sorts+returns the latest stored `OddsSnapshot` for a match — directly
  reusable as "get the current snapshot to quote against," no duplicate query
  needed.

## Design

### Formula

A genuine bug was caught and fixed during design review, not just an alternative
considered: an early version of this formula (`bidOdds = fairOdds * (1 -
halfSpread)`) can produce a `bidOdds` below `1.0` for heavy favorites — decimal
odds below `1.0` are mathematically invalid (`1.0` is the theoretical floor,
representing zero profit). This is not a theoretical edge case: this app's own
real captured data has odds as low as `1.04` (Colombia vs Ghana). At the
worst-case 16% spread, `1.04 * 0.92 = 0.957` — invalid. Fixed with an explicit
floor.

```
BASE_SPREAD_PCT = 2            // floor - no market maker ever quotes zero width
MAX_PRESSURE_CONTRIBUTION_PCT = 6
FIELD_PRESSURE_MAX = 45        // matches the existing upstream constant
UNRELIABLE_PENALTY_PCT = 4
SUSPENDED_PENALTY_PCT = 8       // 2x UNRELIABLE, mirrors the existing momentum
                                // score's own ~1.8x SUSPENDED:UNRELIABLE ratio (18:10)
MIN_SPREAD_PCT = 2
MAX_SPREAD_PCT = 20             // defensive ceiling; naturally bounded to 16% in
                                 // the worst real case (SUSPENDED + HIGH_DANGER)
MIN_BID_ODDS = 1.01              // decimal-odds floor fix

pressureContribution = (fieldPressureScore / 45) * 6
reliabilityContribution =
  reliability === "SUSPENDED" ? 8 :
  reliability === "UNRELIABLE" ? 4 :
  0   // RELIABLE and UNKNOWN both get 0, matching the existing momentum score's
      // precedent of not penalizing UNKNOWN

totalSpreadPct = clamp(2 + pressureContribution + reliabilityContribution, 2, 20)
halfSpread = totalSpreadPct / 200

bidOdds = max(1.01, fairOdds * (1 - halfSpread))
askOdds = fairOdds * (1 + halfSpread)
```

Applied uniformly to home/away/draw — the uncertainty signal (field pressure,
reliability) is match-level context, not side-specific, so all three outcomes
get the same `totalSpreadPct`.

Discrete `spreadWidth` label for display: `<= 4%` → `NARROW`, `<= 10%` →
`MODERATE`, `> 10%` → `WIDE`. Verified across realistic combinations:
`RELIABLE + NONE` = 2% → NARROW; `UNRELIABLE + HIGH_DANGER` = 12% → WIDE;
`SUSPENDED + HIGH_DANGER` = 16% → WIDE.

No equivalent ceiling problem exists on the ask side — decimal odds can
legitimately be very large (this app's real data already has odds of 780), so
no artificial cap is applied there.

### Location and structure

- New pure function module `apps/api/src/logic/marketMaker.ts`, exporting
  `computeMarketMakerQuote(match: Match, snapshot: OddsSnapshot):
  MarketMakerQuote`. No nullable return needed (unlike
  `buildSignalFromSnapshots`, which needs a snapshot *pair* — this only needs
  one snapshot, always computable). Local `round`/`clamp` helpers, duplicated
  rather than imported from `signalEngine.ts`, keeping the two modules
  independent per this codebase's existing small-module convention.
- New `MarketMakerQuote` type in `apps/api/src/types.ts`.
- New test file `apps/api/src/logic/marketMaker.test.ts`, mirroring
  `signalEngine.test.ts`'s exact conventions (Vitest `describe`/`it`/`expect`, a
  `makeMatch`/`makeSnapshot`-style factory with `Partial<T>` overrides, inline
  comments explaining arithmetic, boundary assertions via
  `toBeGreaterThanOrEqual`/`toBeLessThanOrEqual`).
- New endpoint `GET /api/market-maker` in `server.ts` (optional `?matchId=`
  filter, same pattern as `/api/odds-history`), always returns
  `{ data: MarketMakerQuote[] }` — filtered to one match if `matchId` is given,
  otherwise one quote per currently-tracked match with an available snapshot.
  Documented in `openapi.yaml` following the exact existing structure used for
  `/api/odds-history`.
- New frontend panel `apps/web/src/components/MarketMakerPanel.tsx`, matching
  `SignalIntelligencePanel.tsx`'s conventions exactly (lucide-react icons, local
  `API_BASE_URL` const, locally-duplicated types, `useEffect` +
  `Promise.all(fetch...)` + `setInterval` polling, `useMemo` derived state, dark
  Tailwind styling, local subcomponents at the bottom of the file). Mounted in
  `App.tsx` right after `SignalIntelligencePanel` and before
  `ResultsSettlementPanel`.

### Data flow: live-computed, not stored

Computed live at request time by reading `store.matches` and calling the
existing `findPreviousSnapshot()` per match — **not** stored/persisted, **not**
touching `agent.ts`'s cycle loop at all. Chosen over precomputing and storing a
quote per match inside the agent cycle because:

- Zero changes to `agent.ts` or `store.ts`'s mutable state — the lowest-risk way
  to satisfy "must not touch or destabilize" existing logic.
- More accurate than a periodically-cached value: always reflects the freshest
  odds, which are themselves already autonomously refreshed every 5-second agent
  cycle.
- Still genuinely "autonomous" in the meaningful sense: no human curates,
  triggers, or hand-picks the quote; it is a live derivation of continuously
  and autonomously updated real data.

### Non-goals

- Over/Under totals snapshots (where `homeTeam`/`awayTeam` are repurposed as
  "Over 3.5"/"Under 3.5" and "draw" doesn't semantically apply) are not
  special-cased in this pass. The quote is computed generically against whatever
  `homeOdds`/`awayOdds`/`drawOdds` exist on the snapshot; for totals snapshots
  the "draw" field's quote may not be meaningful. Deferred, not silently ignored.
- No quote history/trend storage — the frontend shows the current quote only,
  matching the stated goal ("visualized... showing live bid/ask quotes"), not a
  historical chart.

## Alternatives considered (rejected)

**Precomputed-and-stored-per-cycle** (compute the quote inside `agent.ts`'s
loop, alongside signal generation, and store it in `store.ts`). Rejected:
touches the one file this feature explicitly must not destabilize, for no
accuracy gain over computing live from the same continuously-refreshed data.

## Follow-ups (not in scope for this task)

- Over/Under totals-market-aware quoting (see Non-goals).
- The third suggested hackathon idea, Agent vs Agent Arena, is planned as a
  separate, subsequent feature after this one.
