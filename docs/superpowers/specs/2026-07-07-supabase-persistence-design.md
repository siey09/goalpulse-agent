# Periodic-Snapshot Persistence via Supabase

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

`apps/api/src/store.ts` is entirely in-memory (`{ matches, recentFinishedMatches,
oddsSnapshots, signals, agentRuns }`, plain arrays) and resets on every Render
restart. This is the original risk this entire session's production-readiness
work has been protecting against piecemeal (pinned case studies, this session's
first feature, worked around it for two specific historical signals; this feature
fixes it generally for all future data).

This is the fifth and final planned production-readiness feature this session,
constrained to free tiers with no credit card.

## Goals

- Store state survives a Render restart via periodic snapshotting to Supabase
  (free tier Postgres, no credit card).
- Fail open: if Supabase is unreachable or not configured, the server must never
  block startup or crash — it runs exactly as it does today, in-memory only.
- Minimize risk this close to the deadline: a periodic snapshot, not a full
  ORM/relational rewrite of `store.ts`.

## Non-goals

- No relational schema mirroring `Match`/`AgentSignal`/`OddsSnapshot` individually
  — a single JSON blob is simpler and lower-risk for a one-time snapshot need.
- No real-time/transactional consistency between the in-memory store and
  Supabase — writes are periodic (every 30 seconds), not on every mutation.
- No automated test against a live Supabase instance — none exists yet (see
  "Confirmed constraints").

## Confirmed constraints

The user does not yet have a Supabase project. This spec assumes a
project will be created after implementation, following setup instructions
delivered alongside the code (create project, run one SQL script, add two env
vars to Render). The actual live Supabase connection gets verified by the user
afterward — same pattern already used this session for the API-key/rate-limiting
features, where the user independently verified Render-specific behavior this
environment can't reach directly.

## Design

### Schema

One table, one row, upserted (never grows — avoids the free tier's 500MB storage
cap entirely, no cleanup logic needed):

```sql
create table if not exists store_snapshots (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

### What gets persisted

The entire current `store` object (all 5 fields: `matches`,
`recentFinishedMatches`, `oddsSnapshots`, `signals`, `agentRuns`) as one JSON
blob — broader than the 3 fields the user initially named (`matches`, `signals`,
`oddsSnapshots`), since `agentRuns` (feeds `getStats().lastAgentRun`) and
`recentFinishedMatches` (feeds settlement/audit flows) matter for the same
restart-resilience goal and cost nothing extra to include in the same blob.

### New file: `apps/api/src/services/persistence.ts`

Uses `@supabase/supabase-js` (official client). Exports:

- `saveSnapshot(): Promise<void>` — upserts `{ id: 1, data: {...store}, updated_at: <now> }`.
  Wrapped in try/catch; logs on failure; never throws — a Supabase outage must
  never break the agent cycle that calls it.
- `loadSnapshot(): Promise<void>` — fetches the single row and assigns its
  fields onto the existing exported `store` object in place (does not replace
  the object reference, since other modules import `store` directly). Wrapped
  in try/catch with an internal timeout, so a slow/unreachable Supabase can
  never hang server startup; never throws.

Both no-op immediately if `config.supabaseUrl`/`config.supabaseServiceKey` are
empty — identical fail-open precedent already used in this codebase for Discord
alerts (`alerts.ts`) and on-chain validation (`onchainValidation.ts`).

### Config

Two new fields in `apps/api/src/config.ts`, matching the existing `?? ""`
pattern:

```ts
supabaseUrl: process.env.SUPABASE_URL ?? "",
supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
```

Documented in `.env.example` with a comment explaining the fail-open behavior
when unset.

### Write path

Inside the existing agent-cycle scheduler in `server.ts` (`runGuardedAgentCycle`
/ the `setInterval` that drives it) — not a separate independent timer. A
module-level `lastSnapshotAt` timestamp is checked on each cycle; if 30 real
wall-clock seconds have elapsed since the last write, `saveSnapshot()` runs
(fire-and-forget, not awaited, so a slow write never delays the next cycle).
30 seconds, not a cycle-count threshold, because `AGENT_INTERVAL_MS` differs
between local dev (2000ms) and production (5000ms per `render.yaml`) — a
cycle-count threshold would behave inconsistently across environments.

### Read path

In `server.ts`'s `app.listen(...)` callback, `await loadSnapshot()` runs before
the first `runGuardedAgentCycle("startup")` call, so recovered data is present
before the agent's first live cycle processes new snapshots.

### Testing

No automated test against a live Supabase instance — none exists yet. Instead,
`persistence.ts`'s logic gets unit-tested with a mocked Supabase client
(matching the existing `apiKeyAuth.test.ts` mocking style): no-op when
unconfigured, correct `store` field assignment on a mocked successful load, no
throw on a mocked failure/timeout. The real live connection is verified by the
user after creating the Supabase project and configuring Render's env vars.

## Alternatives considered (rejected)

**Relational schema mirroring each store field as its own table.** Rejected:
disproportionate rewrite risk this close to the deadline for a feature whose
only goal is "survive a restart," not enable relational queries against
Supabase.

**Snapshot on every store mutation (real-time sync).** Rejected: far higher
write volume against a free-tier database for no real benefit — the actual
risk being protected against is a Render *restart*, which happens
infrequently; a 30-second-old snapshot is more than sufficient recovery
fidelity.

## Follow-ups (not in scope for this task)

- Creating the actual Supabase project, running the SQL script, and configuring
  `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` on Render is the user's own follow-up
  step after implementation, mirroring how `API_ACCESS_KEY` and the `trust
  proxy` value were verified live by the user in prior features this session.
- This is the last planned production-readiness feature this session.
