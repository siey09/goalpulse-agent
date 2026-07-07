# Signal Archive

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

The existing Supabase persistence (`apps/api/src/services/persistence.ts`,
`store_snapshots` table) is a single-row, upserted JSON blob of the entire
in-memory `store` — a restart-recovery mechanism, not a permanent record. It
inherits the in-memory store's own caps (`store.signals` capped to 100,
`store.oddsSnapshots` capped to 800) and gets overwritten every 30 seconds. As
signals age out of these caps, and as matches age out of TxLINE's own live
rotation window, they're lost from Supabase too — there is currently no
genuinely growing, permanent history anywhere in this system.

With the World Cup narrowing sharply toward the July 19 final (only ~4 matches
remain after July 11), this matters concretely now: without a permanent
record, most of the signals this system has already generated and verified
will simply be gone by the time the tournament ends, unavailable for the demo
video or for judges reviewing after July 19 when live matches may be sparse
or finished entirely.

## Goals

- An insert-only (never overwrite, never delete) archive that appends a
  permanent copy of every newly-generated signal the instant it happens, and
  again when that same signal later settles to a final `correct`/`incorrect`
  outcome — a real, ever-expanding library of verified signals, immune to any
  in-memory cap or TxLINE's live-rotation window.
- Fully additive: must not touch or modify the existing single-row snapshot
  persistence (`persistence.ts`/`store_snapshots`), settlement logic
  (`store.ts`'s `evaluatePendingSignalsForFinishedMatches`), or signal
  generation (`signalEngine.ts`).
- Fail open, matching every other external-service integration in this
  codebase (`persistence.ts`, `alerts.ts`, `onchainValidation.ts`): a Supabase
  outage must never break the agent cycle that triggers an archive write.

## Decisions made during design (confirmed with the user, not assumed)

1. **Archive twice per signal: creation and settlement, not once.** A
   signal's `resultStatus` starts `"pending"` and is later mutated in place
   (never a new object) by `evaluatePendingSignalsForFinishedMatches` once
   its match finishes. Archiving only at creation would mean every archived
   row shows `"pending"` forever, working against the stated goal of a
   library of *verified* signals. Two insert-only rows per signal (one per
   lifecycle event) stays fully insert-only — it's two distinct facts about
   the signal's history, not an update to either.
2. **The settlement-side archive write is triggered entirely from
   `agent.ts`, via a before/after object-reference diff — `store.ts` is not
   touched.** `evaluatePendingSignalsForFinishedMatches` (in `store.ts`) is
   explicitly named as settlement logic that must not be touched. Detecting
   "which signals just settled" is done by capturing the actual signal
   *object references* that are `"pending"` immediately before calling that
   function, then checking which of those same references are no longer
   `"pending"` immediately after. Because JS holds objects by reference and
   the settlement function mutates `resultStatus` in place on the existing
   `store.signals` entries, this correctly detects every real transition
   without changing `store.ts` at all.
   - Using object references rather than signal ids also sidesteps the
     already-documented duplicate-signal-id known limitation (see
     `2026-07-07-scores-context-freshness-design.md`'s Follow-ups — the same
     underlying stale-finished-match repolling behavior can produce two
     `AgentSignal` objects sharing one `id`). An id-based diff could
     re-archive an already-settled duplicate that merely shares an id with a
     newly-pending one; a reference-based diff cannot, since it only ever
     inspects the exact objects it captured.
3. **Hybrid schema: a handful of real columns for what a demo/judge query
   would actually filter or sort by, plus a full `signal_data jsonb` column
   holding the complete raw `AgentSignal`.** A pure JSONB blob (matching
   `store_snapshots`'s only precedent in this codebase) would need JSONB
   operators for any filtering; a fully relational mirror of every
   `AgentSignal` field would need ongoing schema upkeep as the type evolves.
   The hybrid keeps cheap SQL queries for the columns that matter
   (`match_id`, `side`, `signal_type`, `severity`, `result_status`,
   `momentum_score`, `odds_change_pct`) while guaranteeing nothing is ever
   lost, even if a future field is added to `AgentSignal` and the relational
   columns fall behind.
4. **Signals only for v1 — no `match_archive` table.** Match context
   (`matchId`, the match display name, `target`, `side`) is already durably
   captured inside every archived signal's `signal_data` blob. A separate
   match-archiving table and its own "first time seen as finished" detection
   would be a second table and a second mechanism for comparatively little
   additional demo value this close to the deadline, and was explicitly
   deferred.
5. **Write-only infrastructure for v1 — no new endpoint, no dashboard panel,
   no `/health` change.** `/health` (`server.ts:34-45`) is currently fully
   synchronous with no database calls; adding a live Supabase count there
   would make it async and give a currently-trivial endpoint a new
   latency/failure surface. Verification is by directly browsing the
   Supabase table, the same manual-verification pattern already used for the
   original snapshot-persistence feature. Exposure (a read endpoint, a
   dashboard panel, or a `/health` count) is an explicit, separate follow-up
   once data has actually accumulated.

## Confirmed facts (verified against real code)

- `agent.ts` is imported from exactly one place in the entire codebase —
  `server.ts:7`, `import { processAgentCycle } from "./agent"` — a named
  import, no default export, no barrel/`index.ts` file anywhere in
  `apps/api/src`. Adding new named exports to `agent.ts` is purely additive
  and cannot affect this or any other call site; `processAgentCycle`'s own
  signature (`(): Promise<AgentRun>`) does not change.
- Signal creation happens at `agent.ts:52-53`
  (`if (signal && !signalAlreadyExists(signal)) { store.signals.unshift(signal); signalsCreated += 1; ... }`).
- Settlement happens at `agent.ts:69`
  (`const evaluatedSignals = evaluatePendingSignalsForFinishedMatches();`),
  which internally mutates `signal.resultStatus` in place inside
  `store.ts:109` (`signal.resultStatus = signalWon ? "correct" : "incorrect";`) —
  confirmed this is the only place `resultStatus` is ever changed after
  creation.
- `persistence.ts`'s established fail-open pattern (`getClient()` returns
  `null` if `config.supabaseUrl`/`config.supabaseServiceKey` are unset;
  every operation is wrapped in try/catch, logs on failure, never throws) is
  the exact precedent this feature follows — confirmed by reading
  `persistence.ts` and its test file directly.
- `agent.ts` currently has zero test coverage (no `agent.test.ts` exists) and
  zero exported pure functions besides `processAgentCycle` itself.

## Design

### Schema — appended to the existing `apps/api/supabase-schema.sql`

```sql
create table if not exists signal_archive (
  id bigserial primary key,
  signal_id text not null,
  event text not null check (event in ('created', 'settled')),
  match_id text not null,
  side text not null,
  signal_type text not null,
  severity text not null,
  result_status text not null,
  momentum_score numeric not null,
  odds_change_pct numeric not null,
  signal_data jsonb not null,
  archived_at timestamptz not null default now()
);
```

Pure `insert`, never `upsert`, never `update`, never `delete`. At the
expected volume for the rest of the tournament (a few hundred signals across
~4 remaining matches), this is trivially within Supabase's free-tier storage
cap — the same cap `2026-07-07-supabase-persistence-design.md` explicitly
designed around for the (unrelated, single-row) snapshot table.

### New module: `apps/api/src/services/archive.ts`

Mirrors `persistence.ts`'s exact conventions:

```ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { AgentSignal } from "../types";

const ARCHIVE_TABLE = "signal_archive";

export type ArchiveEvent = "created" | "settled";

function getClient(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseServiceKey);
}

/**
 * Appends one permanent record of a signal's state at a specific moment in
 * its lifecycle (created or settled) to an insert-only archive table -
 * separate from and never touching the existing single-row store_snapshots
 * table. Fail-open: no-ops if Supabase is not configured, and a delivery
 * failure is logged but never thrown - archiving must never break the agent
 * cycle that calls it.
 */
export async function archiveSignal(
  signal: AgentSignal,
  event: ArchiveEvent
): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    await client.from(ARCHIVE_TABLE).insert({
      signal_id: signal.id,
      event,
      match_id: signal.matchId,
      side: signal.side,
      signal_type: signal.signalType,
      severity: signal.severity,
      result_status: signal.resultStatus,
      momentum_score: signal.momentumScore,
      odds_change_pct: signal.oddsChangePct,
      signal_data: signal,
    });
  } catch (error) {
    console.error("[archive] Failed to archive signal to Supabase:", error);
  }
}
```

### Wiring — both call sites in `agent.ts` only

Two new exported pure functions (testable with plain objects, no network
mocking needed):

```ts
export function findPendingSignals(signals: AgentSignal[]): AgentSignal[] {
  return signals.filter((signal) => signal.resultStatus === "pending");
}

export function findNewlySettledSignals(
  signalsCapturedWhilePending: AgentSignal[]
): AgentSignal[] {
  return signalsCapturedWhilePending.filter(
    (signal) => signal.resultStatus !== "pending"
  );
}
```

**Creation site** — find:

```ts
      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;
```

Add directly after `signalsCreated += 1;`:

```ts
        void archiveSignal(signal, "created");
```

**Settlement site** — find:

```ts
    const evaluatedSignals = evaluatePendingSignalsForFinishedMatches();
```

Replace with:

```ts
    const pendingSignalsBeforeEvaluation = findPendingSignals(store.signals);
    const evaluatedSignals = evaluatePendingSignalsForFinishedMatches();

    for (const signal of findNewlySettledSignals(pendingSignalsBeforeEvaluation)) {
      void archiveSignal(signal, "settled");
    }
```

Both call sites use `void` (fire-and-forget, not awaited) — matching the
exact precedent already in this same function for `saveSnapshot()`'s call
site in `server.ts` and the Discord alert dispatch a few lines above the
creation site: a slow or failing external call must never delay the agent
cycle.

### Testing

`apps/api/src/services/archive.test.ts` — mocks `@supabase/supabase-js`
exactly like `persistence.test.ts`: no-ops when unconfigured (insert mock
not called), correct insert payload shape when configured (all ten columns
present, `event` set correctly), never throws when the mocked insert
rejects.

`apps/api/src/agent.test.ts` (new file — first test coverage for this
module) — covers only the two new pure functions, not the full
`processAgentCycle` network path:

- `findPendingSignals` returns only signals with `resultStatus === "pending"`
  from a mixed list.
- `findNewlySettledSignals` returns a signal whose `resultStatus` was
  mutated away from `"pending"` after being captured, and excludes one that
  is still `"pending"`.

## Alternatives considered (rejected)

**Hooking the settlement archive write directly inside
`evaluatePendingSignalsForFinishedMatches` in `store.ts`.** Simpler (no
before/after diff needed), but `store.ts` was explicitly named as settlement
logic that must not be touched — the reference-diff approach in `agent.ts`
achieves the same detection with zero changes to `store.ts`.

**A separate `match_archive` table in v1.** Rejected per Decision #4 — match
context is already captured inside every archived signal, and the comparative
value of a second table/mechanism didn't justify the added scope this close
to the deadline.

**Exposing this via a new endpoint or dashboard panel now.** Rejected per
Decision #5 — write-only infrastructure first; exposure is a deliberate,
separate follow-up once real data has accumulated.

## Non-goals

- No changes to `persistence.ts`, `store_snapshots`, `store.ts`, or
  `signalEngine.ts`.
- No match archiving.
- No read endpoint, dashboard panel, or `/health` change.
- No batching, rate-limiting, or retry logic for archive inserts — expected
  volume for the rest of the tournament is trivially low.
- No automated test against a live Supabase instance — same precedent as
  `persistence.ts`; the real connection is verified by the user directly,
  the same pattern already used for the original snapshot-persistence
  feature.

## Follow-ups (not in scope for this task)

- A read-only `GET /api/archive` endpoint and a "Full Tournament Archive"
  dashboard panel, once data has accumulated — deferred per Decision #5.
- A `match_archive` table, if match-level (not just signal-level) permanent
  history is ever needed — deferred per Decision #4.
- Running the appended SQL against the same existing Supabase project (no
  new project needed) is the user's own follow-up step after implementation,
  mirroring how `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` were already configured
  for the original snapshot-persistence feature.
