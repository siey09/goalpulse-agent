# P1 Tier 2: Rejection Reasons, Basic Metrics, Bounded Queues, Idempotency

**Date:** 2026-07-11
**Status:** Approved

## Problem

Tier 2 of the external technical review's P1 remediation — "moderate,
additive, low regression risk," per the user's 3-tier sequencing.
Started only after Tier 1 (CI, dependency pinning, CORS, LICENSE) was
independently verified live and approved by the user. Four items:
P1-6, P1-15, P1-17, P1-18.

One of the four (P1-17) was investigated and found to need no change.
This spec covers the three that require actual changes, plus documents
the P1-17 verdict for the record.

## P1-6: Expose Arena rejection reasons

**Scope, confirmed with the user:** Arena-only, matching the original
P0-6 finding precisely — not the signal-generation-level silent drops
found during investigation (`signalEngine`'s chronological-validity
gate, `signalAlreadyExists` dedup). Those remain silent, unchanged,
out of scope for this item.

`buildMomentumFollowerPosition`, `buildContrarianPosition`, and
`buildKellyCriterionPosition` (`logic/arena.ts`) are untouched — same
signature, same `ArenaPosition | null` return, zero risk to their
existing tests in `arena.test.ts`. New pure function alongside them:

```typescript
export type RejectionReason =
  | "totals_signal"
  | "not_market_only_move"
  | "no_original_snapshot";

export interface ArenaRejection {
  agentId: ArenaAgentId;
  signalId: string;
  matchId: string;
  reason: RejectionReason;
  reasonText: string;
}

export function getRejectionReason(
  agentId: ArenaAgentId,
  signal: AgentSignal,
  originalSnapshot: OddsSnapshot | undefined
): ArenaRejection | null {
  if (isTotalsSignal(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "totals_signal",
      reasonText: "Totals signal — Arena only trades 1X2 markets.",
    };
  }

  if (agentId !== "contrarian") return null;

  if (!isMarketOnlyMove(signal)) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "not_market_only_move",
      reasonText:
        "Field-backed move — Contrarian only fades market-only moves.",
    };
  }

  if (!originalSnapshot) {
    return {
      agentId,
      signalId: signal.id,
      matchId: signal.matchId,
      reason: "no_original_snapshot",
      reasonText:
        "Original odds snapshot unavailable — cannot price the opposite side.",
    };
  }

  return null;
}
```

`computeArenaScoreboards` calls this once per agent per signal
alongside the existing `build*Position` calls (same loop, no new
iteration), collecting non-null results into a new `rejections:
ArenaRejection[]` array returned alongside the three scoreboards.
`GET /api/arena`'s response gets one new top-level field,
`rejections`, purely additive — every existing field unchanged.

**Frontend:** `ArenaPanel.tsx` gets a small "N signals not traded"
line per agent card (count of that agent's rejections), expandable to
show `reasonText` per entry. Reuses existing card styling, no new
component. Deliberately minimal given deadline proximity — this is
visibility, not a new analysis feature.

## P1-15: Basic metrics

New `GET /api/metrics` endpoint — separate from `GET /health`, not an
extension of it. Matches this project's existing precedent of
`/api/feed-health` being its own endpoint distinct from the liveness
probe; keeps `/health` fast and its shape stable for any uptime
monitor polling it.

```typescript
{
  uptimeSeconds: number;           // process.uptime()
  lastAgentCycle: {
    startedAt: string;
    finishedAt: string;
    decisionLatencyMs: number;     // finishedAt - startedAt, from the
                                    // existing AgentRun fields — no new
                                    // tracking needed, just exposed
  } | null;                        // null if no cycle has run yet
  liveStream: {
    connected: boolean;
    staleForMs: number | null;     // Date.now() - lastEventAt, null if
                                    // never connected
    totalReconnects: number;
  };
  liveOddsStream: {
    connected: boolean;
    staleForMs: number | null;
    totalReconnects: number;
  };
  duplicatesDropped: {
    snapshots: number;
    signals: number;
  };
}
```

`liveStream`/`liveOddsStream`/`totalReconnects` are read from the
existing `getLiveStreamState()`/`getLiveOddsStreamState()` (no new
state) — this endpoint just reshapes/derives `staleForMs` from their
existing `lastEventAt`.

**New state, genuinely not tracked today:** two counters,
`store.duplicatesDropped = { snapshots: 0, signals: 0 }`, incremented
in `agent.ts` at the two exact spots that already silently `continue`
past a duplicate (`snapshotAlreadyExists` check, `signalAlreadyExists`
check) — one-line increments at existing branches, no new control
flow. Cumulative since process start (consistent with `uptimeSeconds`
framing), not reset per cycle. Included in the existing
`saveSnapshot()`/`loadSnapshot()` Supabase persistence round-trip
(`persistence.ts`'s `StoreSnapshot` type gets one new optional field)
so the counters survive a restart rather than silently resetting to 0
— resetting on every Render restart would make them misleading as a
"since when" metric.

## P1-17: Bounded queues — investigated, no change needed

Every in-memory array with unbounded growth potential is already
capped: `store.oddsSnapshots` (800), `store.signals` (100),
`store.agentRuns` (50) — all three capped in `agent.ts` immediately
after each cycle's mutations; `store.recentFinishedMatches` (20) —
capped in `store.ts`'s `upsertRecentFinishedMatches`. Every newer
logic module (`feedHealth.ts`, `signalCorrelation.ts`,
`historicalPatternMatch.ts`, `signalPerformance.ts`) computes fresh
from these already-capped arrays at request time — none holds its own
independent accumulating state. Confirmed by grep across `logic/` for
any array literal outside a function body (the only candidates were
local, function-scoped, never module-level).

Same verdict pattern as P1-13/P1-14 in Tier 1: no code change, only a
documented investigation.

## P1-18: Idempotency for archive writes

In-memory dedup is already solid and out of scope for changes:
`snapshotAlreadyExists` (by `id`), `signalAlreadyExists` (by
`matchId`+`side`+`signalType`+`oddsBefore`+`oddsAfter`, 6-hour
window). The real gap is downstream: `archiveSignal`/`archiveMatch`
(`services/archive.ts`) are plain `.insert()` calls with no
uniqueness at the database level.

**Concrete failure mode:** `saveSnapshot()` upserts the whole
in-memory store to Supabase every 30s. If the process crashes in that
window — after a match/signal was archived but before the next
periodic save captures that fact in `recentFinishedMatches`/
`signals` — a restart's `loadSnapshot()` recovers a stale snapshot
that doesn't yet show the match/signal as known. The next cycle
re-detects it as "newly finished"/"new" and archives it again: a
duplicate row.

**Fix — two Supabase SQL statements, run manually by the user in the
SQL editor (same as `match_archive`'s original setup), flagged when
ready:**

```sql
alter table signal_archive
  add constraint signal_archive_signal_event_unique
  unique (signal_id, event);

alter table match_archive
  add constraint match_archive_match_id_unique
  unique (match_id);
```

`signal_archive`'s constraint is `(signal_id, event)`, not
`signal_id` alone — a signal legitimately gets two rows (`created`,
`settled`); only the same event happening twice for the same signal
is a true duplicate.

**Behavior change, not a bug fix — flagged explicitly:** the original
`match_archive` design (`docs/superpowers/specs/2026-07-10-match-archive-design.md`,
"Duplicate rows (accepted behavior)" section) deliberately chose an
insert-only log with no uniqueness constraint, explicitly accepting
a second row per `match_id` on restart-rediscovery as intentional,
matching `signal_archive`'s own precedent. This unique constraint
**supersedes that decision for `match_archive` specifically** — the
duplicate was never a goal, just a tolerated side effect of the
original insert-only design, and preventing it is a genuine
improvement. `signal_archive` is unaffected in spirit: its
`(signal_id, event)` constraint still permits exactly the two rows
per signal the original design always intended, only blocking a true
re-archive of the same event.

**Code change:** both `archiveSignal` and `archiveMatch` switch from
`.insert(...)` to `.upsert(...)` with `ignoreDuplicates: true` and an
explicit `onConflict` naming the exact constraint columns —
`"signal_id,event"` for `archiveSignal`, `"match_id"` for
`archiveMatch` — so a collision is silently absorbed (a no-op,
matching the existing fail-open philosophy) rather than surfacing as
a logged Supabase error on every restart-overlap case.

**Sequencing:** the SQL statements must be run before the code change
is deployed (an `upsert` with `ignoreDuplicates` against a table with
no matching constraint just behaves like a plain insert — harmless,
but the dedup wouldn't take effect until the constraint exists). The
code change is otherwise safe to write and merge first; the user will
run the SQL once flagged, and the fix becomes fully active from that
point in production.

## Testing

**Backend:** new unit tests for `getRejectionReason` (one per
`RejectionReason` case, plus the "no rejection" case for a normal
tradeable signal) in `arena.test.ts`; new tests for the
`duplicatesDropped` counters incrementing on the exact two existing
dedup branches in `agent.test.ts`; `GET /api/metrics` and the new
`rejections` field on `GET /api/arena` covered by route-level tests
alongside the existing ones in `server.test.ts` (or equivalent).
Existing 216 tests must stay green throughout — no existing function
signature changes.

**Frontend:** `ArenaPanel.tsx`'s new rejection-count line verified
manually in a local dev browser against live production data (no
frontend test runner in this project, consistent with every other
frontend change this session).

**Idempotency fix:** cannot be verified by a unit test in any
meaningful way (the failure mode is a Supabase-level race across a
process restart) — verified by confirming the `upsert`/`onConflict`
call succeeds against Supabase with the constraint in place (a real
duplicate insert attempt returns success with `ignoreDuplicates`
rather than a constraint-violation error), once the user has run the
SQL.

## Out of scope (explicitly deferred)

- Signal-generation-level silent drops (chronological-validity gate,
  `signalAlreadyExists` dedup reasons) — confirmed out of scope for
  P1-6 by the user, Arena-only.
- Tier 3 — explicitly sequenced after Tier 2 is reviewed and approved,
  not touched in this phase.
- The 20 mandatory tests and 15-item Definition of Done checklist —
  explicitly sequenced after all three tiers complete.
