# CONFIRMED_TRAP → OUTCOME_REJECTED_MOVE Rename + Arena Proof Note Wording Fix

**Date:** 2026-07-11
**Status:** Approved

## Problem

An external technical review (P0-4) correctly identified that `CONFIRMED_TRAP`
is used as a literal signal status across the codebase, asserting a level
of certainty ("confirmed") about manipulation or trap behavior that a
signal simply losing at settlement does not actually prove. Separately
(P0-5), `ArenaPanel.tsx`'s "Tamper-evident settlement" section renders a
backend note string that conflates a purely local SHA-256 ledger hash
with a genuinely separate real on-chain Merkle proof, in a way that
could mislead a reader into thinking the ledger hash itself is checked
against Solana. Both are bundled into one phase: same category of "say
only what's true" correction, both low-risk, mechanical, no new
dependencies or backend logic changes.

**Verification already done before scoping this** (see the 2026-07-10
brainstorm): P0-1/P0-2 confirmed false premise (single-bookmaker feed,
no aggregation logic exists), P0-3 confirmed already addressed
(existing `scoresContextFreshness.ts` gate + deterministic replay), P0-6
confirmed no structural gap worth new code. None of those are touched by
this spec.

## Scope: the rename

`CONFIRMED_TRAP` → `OUTCOME_REJECTED_MOVE` (the value only —
`POSSIBLE_TRAP`, `WATCHING`, `VALIDATED_MOVE`, `LOW_TRAP_RISK` are
unchanged; they already hedge appropriately or don't share the problem).

Additional scope found while preparing this spec, confirmed in-scope by
the user ("touch every usage so nothing is left inconsistent"):

- Two UI headlines that key off the old value and assert certainty
  ("False market move exposed") get reworded to match the new label's
  honesty, not just the raw string literal.
- Two UI badges display the word "confirmed" directly (sourced from the
  `confirmedTraps` count) — the **displayed word** changes to "rejected";
  the underlying JSON field name `confirmedTraps` stays unchanged (an
  API-contract rename is out of scope, not requested).
- `README.md`'s matching prose phrase, "(confirmed trap):", gets the
  same treatment.

## File-by-file changes

### `apps/api/src/server.ts` (2 occurrences)

1. Line 831 — `trapStatus: "CONFIRMED_TRAP"` → `trapStatus: "OUTCOME_REJECTED_MOVE"` (inside `classifyMarketTrap`'s `movement >= 15` branch). `trapReason` on this branch ("GoalPulse flags this as a possible smart money trap or false market move.") is left unchanged — it already hedges with "possible" and doesn't assert certainty.
2. Line 964 — the `confirmedTraps` count's filter predicate: `signal.trapStatus === "CONFIRMED_TRAP"` → `signal.trapStatus === "OUTCOME_REJECTED_MOVE"`. The variable name `confirmedTraps` itself is unchanged (JSON field, API contract).

### `apps/web/src/App.tsx` (4 direct `CONFIRMED_TRAP` occurrences + 2 related wording spots)

1. Line 701 — filter predicate (analyst-chat `topTrap` computation): `signal.trapStatus === "CONFIRMED_TRAP"` → `"OUTCOME_REJECTED_MOVE"`.
2. Line 3270 — filter predicate (Smart Money Trap Detector list): same change.
3. Line 3655 — "Agent verdict" headline condition: `selectedSignal.trapStatus === "CONFIRMED_TRAP"` → `"OUTCOME_REJECTED_MOVE"`, **and** the resulting headline text `"False market move exposed"` → `"Market move rejected by outcome"`.
4. Line 3704 — "5. Final verdict" headline condition, same pair of changes (condition value + headline text).
5. Line 3256 — badge text `{confirmedTraps} confirmed • {possibleTraps} possible` → `{confirmedTraps} rejected • {possibleTraps} possible` (display word only; `summary.confirmedTraps`/`summary.possibleTraps` field access unchanged).
6. Line 741 — analyst-chat reply string: `` `...with ${summary.confirmedTraps ?? 0} confirmed and ${summary.possibleTraps ?? 0} possible.` `` → `` `...with ${summary.confirmedTraps ?? 0} rejected and ${summary.possibleTraps ?? 0} possible.` `` (display word only, same field access).

### `apps/web/src/data/pinnedCaseStudies.ts` (3 occurrences)

1. Line 58 — type literal: `trapStatus?: "CONFIRMED_TRAP"` → `trapStatus?: "OUTCOME_REJECTED_MOVE"`.
2. Lines 169, 215 — the two pinned case study data entries' `trapStatus: "CONFIRMED_TRAP"` → `"OUTCOME_REJECTED_MOVE"`. No accompanying prose in this file to adjust.

### `openapi.yaml` (1 occurrence)

Line 280 — enum list: `enum: [WATCHING, VALIDATED_MOVE, CONFIRMED_TRAP, POSSIBLE_TRAP, LOW_TRAP_RISK]` → `enum: [WATCHING, VALIDATED_MOVE, OUTCOME_REJECTED_MOVE, POSSIBLE_TRAP, LOW_TRAP_RISK]`.

### `README.md` (1 occurrence, plus matching prose)

Line 25: `**Canada vs Morocco** (confirmed trap): ... correctly classified both as \`CONFIRMED_TRAP\` with \`EXTREME_REVERSAL\` risk...` → `**Canada vs Morocco** (outcome-rejected move): ... correctly classified both as \`OUTCOME_REJECTED_MOVE\` with \`EXTREME_REVERSAL\` risk...`.

### `TECHNICAL_DOCS.md` (1 occurrence)

Line 180: both literal mentions of `` `CONFIRMED_TRAP` `` → `` `OUTCOME_REJECTED_MOVE` ``. Surrounding descriptive prose ("Smart Money Trap Classification — signals rejected by the final result are labeled...") is accurate as-is and unchanged — it already describes the mechanism honestly (signals rejected by the final result), not asserting proof of manipulation.

### `SUBMISSION_NOTES.md` (1 occurrence)

Line 269: `` `CONFIRMED_TRAP` `` → `` `OUTCOME_REJECTED_MOVE` ``. Surrounding prose unchanged for the same reason as `TECHNICAL_DOCS.md`.

### Explicitly untouched (per prior agreement)

Historical spec/plan docs (`docs/superpowers/specs/2026-07-07-pinned-case-studies-design.md`,
`docs/superpowers/plans/2026-07-07-pinned-case-studies-plan.md`,
`docs/superpowers/plans/2026-07-07-openapi-docs-plan.md`,
`docs/superpowers/plans/2026-07-10-analyst-chat-topic-expansion.md`) and
`pinned-case-studies-raw.json` (a frozen, one-time data source not
imported by any live code) — frozen point-in-time records of past
decisions, not rewritten retroactively, matching this session's
established norm.

## P0-5: `arena.proof.note` wording fix

**File:** `apps/api/src/server.ts` (the `/api/arena` route's `proof.note`
field, rendered verbatim by `ArenaPanel.tsx:372`).

Old:

> "Tamper-evident SHA-256 hash of all three agents' full position ledgers, plus a real on-chain Merkle proof (via GET /api/onchain/validate-stat) confirming the underlying TxLINE data this tournament is based on is genuinely anchored on Solana mainnet. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution."

New:

> "SHA-256 hash of all three agents' full position ledgers - computed locally, tamper-evident only if compared against another copy, never itself posted to Solana. The separate 'Verify underlying data' check below runs a real Solana mainnet Merkle proof confirming the underlying TxLINE stat is genuinely anchored on-chain - that check covers the source data, not this specific ledger hash. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution."

No other field in the `proof` object changes. The `/api/replay/backtest`
route's own, separate `proof.note` field (lines ~1081-1083, "Wallet
configured..." / "Proof hash generated...") already reads honestly
(never claims to already be verified/anchored) and is not touched.

## Testing

**Backend:** existing test suite (`apps/api`) is searched for any
`CONFIRMED_TRAP` string dependency before implementing — if found,
updated to `OUTCOME_REJECTED_MOVE` in lockstep so no test silently
passes against stale expectations. `npm run test` must stay green.

**Frontend:** no test runner exists in `apps/web` — verified via clean
`npm run build` and a manual dev-browser check: confirm a
Canada-vs-Morocco-style rejected-move signal (or the pinned case study
data, which is guaranteed to exercise this path) displays "Market move
rejected by outcome" instead of the old headline, and the Smart Money
Trap Detector badge reads "N rejected" instead of "N confirmed". Confirm
`ArenaPanel.tsx`'s "Tamper-evident settlement" section shows the new,
split wording.

Per the session's process: merge only after user review, then verify
live in production.

## Out of scope (explicitly deferred)

- No change to `POSSIBLE_TRAP`, `WATCHING`, `VALIDATED_MOVE`,
  `LOW_TRAP_RISK` — already appropriately hedged or not applicable.
- No rename of the `confirmedTraps`/`possibleTraps`/`smartMoneyTraps`
  JSON field names — API-contract stability, not requested.
- No change to the "Smart Money Trap Detector" panel name/heading — a
  broader pre-existing feature-name decision, not the specific
  over-claiming issue this fix addresses.
- No change to historical spec/plan docs or `pinned-case-studies-raw.json`.
- No P0-6 state-machine code (explicitly declined by the user as not
  worth it this close to the deadline).
- P1 list (CI workflows, dependency pinning, CORS restriction, LICENSE
  file) — added to `PROJECT_STATE.md` as deliberately-deferred known
  gaps once this phase closes, not implemented now.
