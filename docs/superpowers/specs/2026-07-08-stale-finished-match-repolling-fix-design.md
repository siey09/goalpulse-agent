# Stale-Finished-Match Repolling Fix Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

Documented in `TECHNICAL_DOCS.md`'s "Known limitations": a long-finished
fixture can remain in `fetchTxLineFeed()`'s live poll rotation, since
`prioritizeLikelyLiveFixtures()` only *re-ranks* fixtures by a
`StartTime`-based heuristic — it never *filters out* ones already
confirmed finished. If fewer than 14 fixtures look "likely live" (the
rotation cap), a finished fixture still fills a slot and gets fully
reprocessed every cycle: scores and odds refetched from TxLINE,
`selectMovementOdds` re-selecting the same single strongest historical
compression pair every time (it has no recency bound). Once that pair's
`OddsSnapshot`s age out of the shared 800-entry FIFO cache (which happens
within a handful of cycles given real snapshot volume — much faster than
the dedup window) and `signalAlreadyExists`'s 6-hour dedup window has also
passed, a "new" `AgentSignal` is created for the exact same historical
tick with a fresh `createdAt`.

## Where to fix it (and where not to)

The correct chokepoint is inside `fetchTxLineFeed()`, before
`prioritizeLikelyLiveFixtures()` runs at all — the single place that
decides which fixtures get scores/odds fetched and processed each cycle.
Patching `selectMovementOdds()` (add a recency bound) or
`signalAlreadyExists()` (widen the dedup window or key) were both
considered and rejected: either would only mask the symptom per-signal or
per-poll, while TxLINE still gets queried and the fixture still gets
fully reprocessed every cycle — wasted API calls, not just a
signal-duplication risk.

## The key insight: the data already exists

`agent.ts` fully replaces `store.matches` every cycle
(`store.matches = feed.matches`), and each `Match.status` is set to
`"finished"` from real TXODDS score data via `applyScoreSnapshot` — the
same authoritative source signal-settlement already trusts elsewhere. At
the *start* of the next `fetchTxLineFeed()` call (before this cycle's
replacement happens), `store.matches` still holds the *previous* cycle's
confirmed statuses. This is exactly the "have we already seen this
fixture finish?" signal needed, available with zero new data-fetching —
if the bug is actively occurring for a given fixture, it's necessarily
still occupying a rotation slot, so it's necessarily still present in the
prior cycle's `store.matches`.

**Precedent for the required import:** `txlineClient.ts` needs to import
`store` to read `store.matches`. Checked: `persistence.ts` (a service,
same architectural layer) already imports `store` directly — this isn't a
new violation of layering. Checked: `store.ts` has zero imports of its
own, so there is no circular-dependency risk.

## Implementation

New pure, exported function in `apps/api/src/services/txlineClient.ts`:

```typescript
export function filterOutConfirmedFinishedFixtures(
  fixtures: TxLineFixture[],
  priorMatchesById: Map<string, Match>
): TxLineFixture[] {
  return fixtures.filter((fixture) => {
    const priorMatch = priorMatchesById.get(String(fixture.FixtureId));
    return !priorMatch || priorMatch.status !== "finished";
  });
}
```

Called inside `fetchTxLineFeed()`, immediately after fetching the raw
fixture list and before `prioritizeLikelyLiveFixtures()`:

```typescript
const fixtures = await txlineGet<TxLineFixture[]>("/api/fixtures/snapshot", jwt);
const priorMatchesById = new Map(store.matches.map((match) => [match.id, match]));
const liveFixtures = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);
const prioritizedFixtures = prioritizeLikelyLiveFixtures(liveFixtures);
```

`store` is imported at the top of `txlineClient.ts` alongside its
existing imports.

**No expiry/cooldown needed:** finished matches don't un-finish. The only
way a fixture "reappears" in the gate's consideration is if it naturally
rotates out of `store.matches` on its own (no longer being reprocessed
either way, so no bug instance to prevent).

**Scope boundary:** this only gates the *live* poll path
(`fetchTxLineFeed`). It does not touch `fetchRecentTxLineResults()` (the
separate `/api/recent-results` backfill path, which is expected to
reprocess recently-finished matches once, for settlement) or
`selectMovementOdds()`/`signalAlreadyExists()` themselves — both are left
exactly as they are, since the fix is about *not reaching them at all*
for a confirmed-finished fixture, not about changing their own logic.

## Testing

New test file `apps/api/src/services/txlineClient.test.ts` — the first
ever for this file. Everything else in `txlineClient.ts` is I/O-heavy
(real HTTP calls) and untestable without extensive mocking, verified
instead directly against production per this codebase's existing
convention; `filterOutConfirmedFinishedFixtures` is genuinely pure, so it
gets real unit tests with plain object fixtures:

- A fixture with no prior match entry at all (never seen before) passes
  through unfiltered.
- A fixture whose prior match status was `"live"` (or `"scheduled"`)
  passes through unfiltered.
- A fixture whose prior match status was `"finished"` is filtered out.
- A mixed batch (some finished, some not, some never-seen) filters
  correctly, preserving the relative order of the fixtures that remain.

## Out of scope (explicitly deferred)

- No change to `prioritizeLikelyLiveFixtures()`'s own `StartTime`
  heuristic — it still runs on whatever fixtures survive this new filter,
  unchanged.
- No change to `selectMovementOdds()`/`signalAlreadyExists()` — see above.
- No change to `fetchRecentTxLineResults()`/`/api/recent-results` — a
  separate, intentionally-different code path.
- No dashboard-visible change — this is a backend correctness fix with no
  new API surface.
