# Match Archive — Design Spec

**Date:** 2026-07-10
**Status:** Approved, pending implementation plan.

## Problem

Nothing in this system durably records a match's final state. `Match`
objects (`id`, `competition`, `homeTeam`, `awayTeam`, `homeScore`,
`awayScore`, `status`, `statusId`, `statusLabel`, `clockSeconds`,
`clockLabel`, `lastUpdated`) live only in `store.matches` and
`store.recentFinishedMatches` — both in-memory, and
`recentFinishedMatches` is additionally capped at 20 entries. Once a
finished match ages out of that cap, or the process restarts without a
recent Supabase snapshot, its final state is gone.

`signal_archive` (shipped earlier this session) does not fill this gap:
its `signal_data` blob only contains a *signal's* own fields plus a
scores-context snapshot from whenever that signal fired — never a
`Match` object, and only for matches that happened to produce at least
one signal. A match with zero signals leaves zero permanent trace today.

This was called out as a known limitation when Arena's retroactive
backtest (item #12) deliberately excluded Contrarian: resolving the
opposing side's outcome needs the real match final score, and "neither
the archive nor the archived signal ever captures it." `match_archive`
is the first thing that could actually fix that in the future — this
spec does **not** propose wiring that fix now, only noting why the table
has real value beyond documentation-completeness.

## Goal

An insert-only Supabase table, `match_archive`, that permanently records
every match's state at the moment it's first observed as `"finished"` —
independent of whether it ever produced a signal, and immune to the
in-memory store's caps and to process restarts.

## Schema

New table in `apps/api/supabase-schema.sql`, following `signal_archive`'s
existing insert-only convention exactly:

```sql
-- Insert-only permanent archive: one row per match the first time it's
-- observed as finished. Never upserted, updated, or deleted. A match can
-- legitimately get a second row if the process restarts and rediscovers
-- it as "finished" via a backfill route without having seen the live
-- transition (see "Duplicate rows" below) — this is accepted, not a bug.
create table if not exists match_archive (
  id bigserial primary key,
  match_id text not null,
  competition text not null,
  home_team text not null,
  away_team text not null,
  home_score integer not null,
  away_score integer not null,
  status text not null,
  match_data jsonb not null,
  archived_at timestamptz not null default now()
);
```

`match_id`/`competition`/`home_team`/`away_team`/`home_score`/
`away_score`/`status` are queryable columns mirroring `signal_archive`'s
convention (`match_id`, `side`, `severity`, etc.). `match_data` is the
full raw `Match` object (mirrors `signal_data`), so nothing is lost even
if the `Match` type grows fields later. No new indexes, matching
`signal_archive`'s precedent of relying on default Postgres scans at
this data volume.

Like `signal_archive`, the user runs this SQL manually in the Supabase
SQL editor — not automated by this codebase.

## Write path

### 1. `store.ts` — `upsertRecentFinishedMatches` returns the diff

Current signature: `upsertRecentFinishedMatches(matches: Match[]): void`.

New signature: `upsertRecentFinishedMatches(matches: Match[]): Match[]` —
returns the subset of the input's already-`status === "finished"`
matches (the existing `finishedMatches` filter) that are **not already
present** in `store.recentFinishedMatches` before this call. Since
`recentFinishedMatches` only ever contains matches that were themselves
finished when added, "not already present" and "not already finished"
are equivalent here — no separate status comparison is needed. The
lookup must run against the pre-update state, before the existing upsert
loop mutates `store.recentFinishedMatches`.

This stays a pure, synchronous function — no Supabase import enters
`store.ts`. It mirrors `agent.ts`'s existing `findNewlySettledSignals`
before/after-diff idiom, just centralized inside the one function that
already owns "a match is now known to be finished," instead of
duplicated at each caller.

### 2. `services/archive.ts` — new `archiveMatch`

```ts
export async function archiveMatch(match: Match): Promise<void>
```

Same fail-open contract as the existing `archiveSignal`: no-ops if
`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset, catches and logs (never
throws) on a Supabase failure, so archiving can never break a caller.
Inserts one row per call with the columns above, `match_data: { ...match
}`.

### 3. Call sites — all three existing callers of `upsertRecentFinishedMatches`

- `agent.ts`'s `processAgentCycle` (the live 5s poll loop)
- `server.ts`'s `GET /api/recent-results` (lazy backfill, fires when
  `recentFinishedMatches` is empty or has no matching odds history)
- `server.ts`'s `GET /api/replay/backtest` (same lazy backfill call)

Each captures the return value and fires the archive call for every
newly-finished match:

```ts
const newlyFinishedMatches = upsertRecentFinishedMatches(feed.matches);
for (const match of newlyFinishedMatches) {
  void archiveMatch(match);
}
```

Fire-and-forget (`void`), matching how `archiveSignal` is already called
from `agent.ts` — archiving must never block or fail the caller's own
response/cycle.

### Duplicate rows (accepted behavior)

If the process restarts and a match gets rediscovered as `"finished"`
via a backfill route (because `recentFinishedMatches` was empty and had
no prior record of that match's status), it will archive again — a
second row for the same `match_id`. This is intentional, not a bug: it
matches `signal_archive`'s own precedent of being an insert-only log
rather than a table with a uniqueness constraint. A future reader would
take the most recent row by `archived_at`.

## Read path

None. Write-only for this pass, exactly matching how `signal_archive`
shipped initially (`GET /api/archive` was a separate, later item). Easy
to add later if a concrete need shows up.

## Testing

- `store.test.ts`: unit tests for the new diff behavior on
  `upsertRecentFinishedMatches` — not-previously-seen match transitions
  to finished (returned), already-finished match stays finished across
  calls (not returned again), a still-live match (not returned), and a
  mixed batch (only the genuinely-newly-finished ones returned).
- `services/archive.test.ts`: unit tests for `archiveMatch`'s fail-open
  behavior (unconfigured Supabase → no-op, no throw) and success path
  (correct table/columns), mirroring `archiveSignal`'s existing test
  style with a mocked Supabase client.
- No integration test against real Supabase (no live credentials in this
  dev environment), consistent with the rest of the archive/persistence
  layer.

## Explicitly out of scope

- No read endpoint.
- No wiring of `match_archive` final scores into Arena's backtest
  Contrarian exclusion (item #12) — noted as a future beneficiary only.
- No dashboard panel.
- No backfilling historical matches that already finished and aged out
  before this feature existed — only newly-observed finishes going
  forward.
