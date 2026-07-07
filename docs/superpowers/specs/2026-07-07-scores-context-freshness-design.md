# Scores-Context Freshness Gate

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

While verifying an extreme Arena result (Momentum Follower 18/18 "incorrect" on
USA vs Belgium, a real 1-4 loss — confirmed correct, not a bug), a separate,
real anomaly was found in the underlying signal data: the `scoresContext`
metadata (`minute`, `sequence`, `fieldPressureScore`) attached to some signals
is not always consistent with the odds tick it's attached to. One signal's
`evidence.scoresContext` showed `sequence: 799, minute: 65` immediately after
two signals showing `sequence: 825, minute: 68`, even though its own tick
timestamp was later in wall-clock time.

Traced to `apps/api/src/services/txlineClient.ts`: both `fetchTxLineFeed()`
(live path) and `fetchRecentTxLineResults()` (recent-results backfill path)
compute exactly one `scoresContext` per poll, from a single scores snapshot,
and stamp that same object onto every odds tick selected for that poll —
including ticks pulled from well outside the "recent" window by
`selectMovementOdds`, which deliberately searches the *entire* historical
odds array for the single strongest one-step compression pair, regardless of
how far back it falls (`txlineClient.ts:1010-1046`). When that reach-back
picks an old tick, it still gets labeled with whatever `scoresContext`
happened to be current *at poll time*, not at the tick's own time.

This does not affect settlement (win/loss is always resolved from the real
final match score, never from `scoresContext`), but it does affect
`fieldPressureScore`, which is exactly what Contrarian's fade trigger
(`isMarketOnlyMove` in `arena.ts`) depends on. A stale-context tick can be
labeled field-backed when it was actually market-only at its own moment, or
vice versa — a real accuracy problem for one of the feature's core claims.

## Goals

- Stop attaching a `scoresContext` to an odds tick when that context does not
  actually describe the tick's own moment.
- Fail safe: when freshness can't be confirmed, omit the context rather than
  guess. `isMarketOnlyMove` (`arena.ts:24-26`) already treats a missing
  `scoresContext` as market-only (the conservative default), so omission needs
  no new fallback logic anywhere downstream.
- Keep the fix small, contained, and testable without new infrastructure or
  network mocking, appropriate for the time remaining before the 2026-07-19
  deadline.

## Decisions made during design (confirmed with the user, not assumed)

1. **Fail-safe over precise.** TxLINE's true historical per-tick scores
   endpoint (`fetchHistoricalScores`) is only available for fixtures that
   started 6+ hours ago — it does not exist for a live match. Building genuine
   per-tick accuracy during live play would require accumulating our own
   scoresContext history over time (new state, new cache, new edge cases) and
   was explicitly rejected in favor of the smaller, safer fix: omit the
   context when we can't confirm it's fresh, rather than build toward proving
   it's correct.
2. **Threshold: 60 seconds.** Chosen from the real gap data on the USA vs
   Belgium signals (`gap = tick timestamp − scoresContext.timestamp`, both
   already-existing fields): 15 of 18 signals showed a gap under 50 seconds
   (max 48.2s, consistent with normal poll jitter/network latency), and the
   two confirmed-stale signals showed gaps of 128.9s and 302.0s. There is a
   clean, empty separation between 48.2s and 128.9s in the observed data — 60s
   sits in that gap, not near either cluster, so it isn't a fragile boundary
   value.
3. **All three call sites get the same fix, not just the one that surfaced
   it.** `fetchTxLineFeed`'s 1X2 loop, `fetchTxLineFeed`'s totals loop, and
   `fetchRecentTxLineResults`'s loop all share the identical "one
   `scoresContext`, many ticks" structure. Fixing only the live 1X2 path would
   leave the same latent mislabeling in the other two.

## Confirmed facts (verified against real code and real production data)

- `TxLineScoresContext.timestamp` (`types.ts:36`) and each odds tick's own
  `Ts` field already exist — no new data needs to be fetched or stored, just
  compared.
- `scoresContext.timestamp` is built from `meaningfulEvent.Ts` at
  `txlineClient.ts:286-288` — a real TxLINE-provided timestamp, not something
  assigned at our own ingestion time.
- `isMarketOnlyMove` (`arena.ts:24-26`) reads
  `signal.evidence?.scoresContext?.fieldPressureScore ?? 0`, which already
  defaults to market-only (`0 < 22`) when `scoresContext` is `undefined` — the
  fail-safe default this fix relies on already exists and needs no changes.
- The three call sites currently pass one shared `scoresContext` value
  unconditionally into `normalizeOddsSnapshot`/`normalizeTotalsSnapshot`:
  `txlineClient.ts:1273` (1X2, live), `txlineClient.ts:1282` (totals, live),
  `txlineClient.ts:1412` (1X2, recent-results backfill).
- `txlineClient.ts` currently has no test file — this fix introduces new,
  additive test coverage rather than needing to update existing tests.

## Design

### New pure function: `isScoresContextFresh`

Colocated in `apps/api/src/services/txlineClient.ts`, next to
`buildScoresContext` (tightly coupled to `TxLineScoresContext`, not worth a
separate module):

```ts
const SCORES_CONTEXT_TOLERANCE_MS = 60_000;

function isScoresContextFresh(
  tickTs: number | undefined,
  contextTimestamp: string | undefined,
  toleranceMs: number
): boolean {
  if (!tickTs || !contextTimestamp) return false;

  const contextMs = new Date(contextTimestamp).getTime();
  return Math.abs(tickTs - contextMs) <= toleranceMs;
}
```

Missing `tickTs` or missing `contextTimestamp` both count as "not fresh"
(omit), never as "assume fresh." The gap is compared as an absolute value —
two real signals showed a small *negative* gap (context timestamp slightly
after the tick, -4.7s and -5.9s), which is normal jitter, not staleness.

### Call-site change (same one-line pattern, three places)

Each of the three loops currently does:

```ts
snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, scoresContext));
```

Becomes:

```ts
const contextForItem = isScoresContextFresh(
  item.Ts,
  scoresContext?.timestamp,
  SCORES_CONTEXT_TOLERANCE_MS
)
  ? scoresContext
  : undefined;

snapshots.push(normalizeOddsSnapshot(match, item, endpointUsed, contextForItem));
```

(And the equivalent for the one `normalizeTotalsSnapshot` call site.)

No changes to `types.ts`, `arena.ts`, `store.ts`, `agent.ts`, or any
consumer — every downstream reader of `evidence.scoresContext` already
handles it being `undefined`.

### Testing

`apps/api/src/services/txlineClient.test.ts` (new file), covering
`isScoresContextFresh` directly with plain numbers/strings — no network
mocking needed:

- Exactly-equal timestamps → fresh.
- Gap just under the threshold → fresh.
- Gap just over the threshold → not fresh.
- Missing tick timestamp → not fresh.
- Missing context timestamp → not fresh.
- Negative gap under the threshold → fresh (context slightly ahead of tick).
- Negative gap over the threshold → not fresh.

## Alternatives considered (rejected)

**Accumulate a per-fixture scoresContext history and match each tick to its
nearest-in-time entry.** This is the "true" fix — it would recover the
correct field-context for a reached-back tick instead of just omitting a
wrong one. Rejected for now: requires new accumulating state per fixture,
cache-eviction logic, and new edge cases (races between polls, no history
available for ticks older than when the server started tracking that
fixture), which is meaningfully more engineering risk this close to the
deadline for a problem the fail-safe default already handles honestly.
Left as a documented follow-up, not attempted here.

**Narrow `selectMovementOdds`'s reach-back window instead.** Rejected:
the "find the single strongest historical compression pair regardless of
recency" behavior is a legitimate, deliberate feature (surfacing the
biggest move in the match), not the bug. The bug is mislabeling that old
tick with a too-new context, not selecting the tick in the first place.

## Non-goals

- Does not attempt to recover the correct field-context for a stale tick —
  only prevents mislabeling one.
- Does not change settlement, win/loss determination, or anything in
  `arena.ts`, `store.ts`, or `agent.ts`.
- Does not change `selectMovementOdds`'s historical reach-back behavior.

## Follow-ups (not in scope for this task)

- If genuine per-tick field-context accuracy is ever needed (not just
  fail-safe omission), revisit the rejected accumulating-history approach
  above as its own design.
