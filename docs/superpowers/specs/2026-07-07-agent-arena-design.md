# Agent vs Agent Arena

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

The hackathon brief's third suggested idea: "Two agents reading the same TxLINE
feed, running opposite strategies. Positions settle on-chain. The better strategy
wins over the course of the tournament." This is the third and final suggested
hackathon feature idea (the first, Sharp Movement Detector, is already covered by
the existing signal engine; the second, In-Play Market Maker, shipped earlier
2026-07-07).

## Goals

- Two agents reading the same live signal feed, running genuinely opposite
  strategies: **Momentum Follower** takes every 1X2 signal at face value;
  **Contrarian** fades signals that look like potential false moves, using a
  live, causal heuristic decided at signal-creation time.
- No look-ahead bias for either agent — decisions use only information available
  at signal-creation time, never the final match result or the post-hoc trap
  classification in `/api/replay/backtest`.
- A live head-to-head scoreboard (net units, ROI%, win rate) — the demo's visual
  "wow moment."
- "Settlement" is tamper-evident and on-chain-verified in an honest, technically
  accurate sense — not funds moving or a smart contract executing.
- Must not touch or destabilize the existing signal engine, P&L, or settlement
  logic — a new, parallel, independent computation layer.

## Decisions made during design (all confirmed with the user, not assumed)

1. **Contrarian's fade trigger**: `fieldPressureScore < 22` at signal-creation
   time — reusing the exact threshold `SignalIntelligencePanel.tsx` already uses
   to label a move `"MARKET-ONLY MOVE"` today. Single condition, chosen over a
   combined two-condition rule for demo clarity.
2. **On-chain settlement wording**: "tamper-evident, on-chain-verified
   settlement," not "positions settle on-chain." Explicitly documented as NOT
   implying funds move or a smart contract executes, consistent with the
   existing analytics-only compliance boundary
   (`GoalPulse... does not place wagers, custody funds, execute trades... or
   facilitate betting execution.`).
3. **Scope**: 1X2 signals only. Over/Under totals signals are excluded from the
   tournament, matching the precedent already established for Market Maker —
   totals settle via a different code path (`signal.target` regex match) than
   1X2 signals (`signal.side` check), and including them would mean replicating
   both paths for Contrarian's opposite-side settlement, adding real risk to the
   feature's riskiest part (settlement correctness) for limited benefit.
4. **Momentum Follower's implementation**: its own independent computation in
   the new module, not a wrapper around the existing `getPnlSummary()` —
   mathematically identical logic, but zero coupling risk to the existing P&L
   endpoint (a future change to one can never silently change the other), and
   keeps both agents symmetric in the new module.

## Confirmed facts (verified against real code, not assumed)

- `OddsSnapshot.homeOdds`/`awayOdds`/`drawOdds` (`apps/api/src/types.ts:78-80`)
  are all required fields, and for 1X2 snapshots all three are extracted from
  the *same single raw TxLINE odds record* at build time
  (`txlineClient.ts:1066-1071`, `getPrice(odds, "part1"/"part2"/"draw")`) — a
  real, actually-quoted 3-way price panel from one moment, not synthesized.
  (For Over/Under totals snapshots specifically, `drawOdds` is hardcoded to `1`
  as a placeholder since that market has no draw — irrelevant here since totals
  are out of scope for Arena v1.)
- `TeamSide = "home" | "away"` — strictly binary, no draw option ever exists for
  any signal.
- Existing settlement (`evaluatePendingSignalsForFinishedMatches` in
  `store.ts`) branches by signal type: totals via `signal.target` regex, 1X2 via
  `signal.side === "home" && homeWon`. Confirms the scope decision above.
- Contrarian's settlement is **not** a simple inversion of the original
  signal's `resultStatus`. If the original was `"correct"`, Contrarian
  (opposite side) definitely lost. If the original was `"incorrect"`, that
  could mean either the opposite side won *or* the match was a draw — and in a
  draw, Contrarian's opposite-side bet also loses (neither side "won"). Requires
  checking the real match score for the opposing side specifically, not negating
  the original result.
- `onchainValidation.ts`'s `validateStatOnChain(fixtureId, seq, statKey)` can
  only prove a specific TxLINE-owned stat is anchored on their existing Merkle
  tree — it cannot write our own arbitrary application data (an arena ledger)
  on-chain; that would require deploying a new custom Solana program, out of
  scope this close to the deadline.
- `signal.evidence.currentSnapshotId` (on `TxLineEvidence`) is the id of the
  `OddsSnapshot` the signal was built from — directly usable to look up that
  same snapshot's opposite-side price.

## Design

### Module: `apps/api/src/logic/arena.ts`

Pure functions operating on already-fetched data (matching `marketMaker.ts`'s
pattern — no store access inside the module itself):

- `isMarketOnlyMove(signal): boolean` — `(fieldPressureScore ?? 0) < 22`.
- `isTotalsSignal(signal): boolean` — the same `target` regex pattern used in
  `store.ts`, duplicated locally per this codebase's established convention
  (small independent modules, not shared imports for tiny checks).
- `buildMomentumFollowerPosition(signal): ArenaPosition | null` — `null` for
  totals signals; otherwise takes the signal's own side/target/`oddsAfter`
  verbatim.
- `buildContrarianPosition(signal, match, originalSnapshot): ArenaPosition | null`
  — `null` for totals signals or non-market-only moves; otherwise takes the
  opposite side, reads that side's real quoted price from `originalSnapshot`,
  and settles independently against the real match score (not a negation of the
  original result).
- `computeArenaScoreboards(signals, matchesById, snapshotsById)` — builds both
  agents' position lists and aggregates each into a scoreboard (net units,
  ROI%, win rate%, settled/open counts), using the same flat-1-unit-stake
  convention as the existing P&L feature (`profit = price - 1` if correct,
  `-1` if incorrect).

### Endpoint: `GET /api/arena`

Computed live at request time (same pattern as Market Maker) — reads
`store.signals`, `store.matches`, `store.recentFinishedMatches`,
`store.oddsSnapshots` fresh on every request. No changes to `agent.ts` or
`store.ts`'s mutable state. Response:

```
{
  data: {
    momentumFollower: ArenaScoreboard,
    contrarian: ArenaScoreboard,
    proof: {
      type: "sha256",
      hash: string,               // hash of both position ledgers
      verifiableStat: { fixtureId, seq, statKey } | null,
      note: "..."                 // explicit tamper-evident / no-funds-move wording
    }
  }
}
```

`verifiableStat` names one real signal from the tournament's own data (its
`fixtureId` and `evidence.scoresContext.sequence`, with `statKey` fixed at
`1002`, the value already confirmed to generalize across fixtures). `null` if
no settled signal is available yet to reference.

### On-chain verification: 100% reuse, zero new on-chain code

The frontend calls the **existing** `GET /api/onchain/validate-stat` endpoint
directly with the `verifiableStat` values — no new on-chain-calling code is
written anywhere. This proves the underlying TxLINE data the tournament is
based on is genuinely anchored on Solana mainnet. It does not mean the P&L
ledger itself lives on-chain, and no funds move — documented explicitly
wherever this feature is described.

### Frontend: `apps/web/src/components/ArenaPanel.tsx`

Side-by-side scoreboard cards for both agents (net units, ROI%, win rate%,
settled/open counts), a leader badge (whichever agent currently has the higher
net units), a short list of each agent's most recent positions, and a "Verify
on Solana" button reusing the existing on-chain call pattern already used
elsewhere in the dashboard.

### Testing

`apps/api/src/logic/arena.test.ts`, mirroring `signalEngine.test.ts`/
`marketMaker.test.ts`'s conventions. Key cases: totals signals excluded for
both agents; Contrarian excluded for non-market-only moves; Contrarian's three
settlement outcomes (original correct → Contrarian incorrect; original
incorrect because opposite side won → Contrarian correct; original incorrect
because of a draw → Contrarian also incorrect); Contrarian reads the real
opposite-side price from the snapshot, not a synthesized value; scoreboard
aggregation (net units/ROI%/win rate%) across multiple positions.

## Alternatives considered (rejected)

**Precompute during the agent cycle.** Rejected for the same reason as Market
Maker: touches `agent.ts`, which this feature explicitly must not destabilize,
for no benefit over live computation from already-autonomously-updated data.

**A dedicated `/api/arena/verify-onchain` endpoint.** Rejected: the existing
generic `/api/onchain/validate-stat` already does exactly what's needed given
the right `fixtureId`/`seq`/`statKey` — a second endpoint would just duplicate
it.

## Non-goals

- Over/Under totals signals do not participate in the tournament (see Scope
  decision above).
- No new Solana program or real on-chain write of arena-specific data — see
  "On-chain verification" above.

## Follow-ups (not in scope for this task)

- This is the last of the three suggested hackathon feature ideas.
