# Finished Match History Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve and recover real odds history for every finished fixture, including Norway vs England, and deploy the repaired API and truthful UI.

**Architecture:** A server-only Supabase table permanently archives normalized odds snapshots. A focused resolver serves hot history first, then archive history, then on-demand TxLINE recovery for known finished fixtures; API history and SSE routes share this resolver. The existing hot-store caps stay in place.

**Tech Stack:** Node.js, Express, TypeScript, Vitest, Supabase Postgres and `@supabase/supabase-js`, TxLINE HTTP APIs, React, Vite.

## Global Constraints

- Never synthesize odds, signals, scores, or field context.
- Never expose the Supabase service-role key to the browser.
- Keep the existing 800-snapshot and 100-signal hot-store caps.
- Recovery runs only for known finished fixtures.
- All database and TxLINE failures remain fail-open and visibly truthful.

---

### Task 1: Permanent odds snapshot archive

**Files:**
- Modify: `apps/api/supabase-schema.sql`
- Modify: `apps/api/src/services/archive.ts`
- Modify: `apps/api/src/services/archive.test.ts`

**Interfaces:**
- Produces: `archiveOddsSnapshots(snapshots: OddsSnapshot[]): Promise<void>`
- Produces: `getArchivedOddsSnapshots(matchId: string, limit?: number): Promise<OddsSnapshot[]>`

- [ ] **Step 1: Write failing archive tests**

Add tests that expect `archiveOddsSnapshots` to upsert rows shaped as `{ snapshot_id, match_id, created_at, snapshot_data }` with `onConflict: "snapshot_id"`, and expect `getArchivedOddsSnapshots` to filter by `match_id`, order by `created_at` ascending, limit results, map `snapshot_data`, and return `[]` on errors.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- src/services/archive.test.ts`
Expected: FAIL because both archive functions are missing.

- [ ] **Step 3: Implement the schema and archive functions**

Append an idempotent `odds_snapshot_archive` table with primary key `snapshot_id`, `(match_id, created_at)` index, enabled RLS, revoked `public`/`anon`/`authenticated` access, and explicit `service_role` select/insert grants. Implement batch deduplication before the Supabase upsert and chronological typed reads.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- src/services/archive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(api): archive odds snapshots permanently`

### Task 2: Generic TxLINE history recovery

**Files:**
- Modify: `apps/api/src/services/txlineClient.ts`
- Modify: `apps/api/src/services/txlineClient.test.ts`

**Interfaces:**
- Produces: `fetchTxLineOddsHistoryForMatch(match: Match): Promise<OddsSnapshot[]>`

- [ ] **Step 1: Write failing recovery tests**

Add a test using an arbitrary non-hardcoded fixture ID. Mock the fixture's `/api/odds/updates/<id>` and `/api/odds/snapshot/<id>` responses, call `fetchTxLineOddsHistoryForMatch`, and assert chronological, deduplicated normalized snapshots for the requested match ID. Add an empty/upstream-failure test that returns `[]` rather than synthetic data.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- src/services/txlineClient.test.ts`
Expected: FAIL because the generic recovery function is missing.

- [ ] **Step 3: Implement minimal recovery**

Reuse `getOddsUpdates`, `selectMovementOdds`, `findLatest1x2Odds`, `normalizeOddsSnapshot`, and `sortSnapshotsChronologically`. Fetch only the selected fixture ID, preserve exact 1X2 line selection, combine movement and latest snapshots without duplicates, and return `[]` on unavailable upstream history.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- src/services/txlineClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(api): recover arbitrary finished fixture history`

### Task 3: Shared history resolver and live-stream integration

**Files:**
- Create: `apps/api/src/services/matchHistory.ts`
- Create: `apps/api/src/services/matchHistory.test.ts`
- Modify: `apps/api/src/agent.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces: `ensureMatchOddsHistory(matchId: string): Promise<{ history: OddsSnapshot[]; source: "hot" | "archive" | "txline_recovery" | "unavailable" }>`
- Consumes: archive functions from Task 1 and TxLINE recovery from Task 2.

- [ ] **Step 1: Write failing resolver tests**

Test these paths independently: hot snapshots short-circuit dependencies; archived snapshots merge into the hot store; a finished match with no archive calls TxLINE recovery and archives the result; scheduled/live matches never recover; duplicate concurrent calls share one recovery promise; all-source failure returns `unavailable`.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- src/services/matchHistory.test.ts`
Expected: FAIL because the resolver module is missing.

- [ ] **Step 3: Implement the resolver**

Keep an in-flight `Map<string, Promise<HistoryResult>>`, locate matches across `store.matches` and `store.recentFinishedMatches`, merge recovered snapshots with `mergeOddsSnapshots`, and delete the in-flight entry in `finally`.

- [ ] **Step 4: Archive ongoing snapshots**

Collect newly accepted snapshots in `processAgentCycle` and call `archiveOddsSnapshots` after processing. After `loadSnapshot` at startup, archive the restored hot snapshot set once so the current 800 entries become durable.

- [ ] **Step 5: Integrate API routes**

Make `/api/odds-history` asynchronous and return resolver history for a supplied match ID. In `/api/live/odds-stream`, await the resolver once before the first tick and include `historySource` in the event payload. Preserve the one-second incremental stream afterward.

- [ ] **Step 6: Verify GREEN**

Run: `npm.cmd test -- src/services/matchHistory.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `fix(api): restore finished match odds history`

### Task 4: Truthful finished-match UX

**Files:**
- Modify: `apps/web/src/features/markets/OddsMovementChart.tsx`
- Modify: `apps/web/src/features/markets/OddsMovementChart.test.tsx`

**Interfaces:**
- Consumes: existing `selectedMatch` status and `data` props.
- Produces: status-specific empty copy only; no API contract change.

- [ ] **Step 1: Write failing UI tests**

For a finished selected match with no data, expect “No historical TxLINE odds were available for this finished fixture.” and reject “next real update arrives.” For live/scheduled matches, retain the current waiting copy.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx`
Expected: FAIL because finished fixtures still promise another update.

- [ ] **Step 3: Implement status-specific copy**

Branch only the empty-state explanation on `selectedMatch.status === "finished"`; preserve chart rendering and accessibility behavior.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(web): explain unavailable finished history`

### Task 5: Database migration, verification, and release

**Files:**
- Modify only if verification reveals a defect in the files above.

- [ ] **Step 1: Run complete local verification**

Run API tests and build, web tests/lint/build, `git diff --check`, and an independent code review. Fix all critical and important findings test-first.

- [ ] **Step 2: Apply the additive Supabase migration**

Apply the exact `odds_snapshot_archive` DDL from `apps/api/supabase-schema.sql` to the connected GoalPulse project. Confirm table columns/indexes/grants and run Supabase security and performance advisors.

- [ ] **Step 3: Publish and merge**

Push `codex/finished-history-repair`, create a ready PR, wait for CI/Vercel checks, and squash-merge to `main`.

- [ ] **Step 4: Verify Render and Vercel production**

Wait for the API deployment, then call `/api/odds-history?matchId=18213979`. Require either real snapshots with fixture ID `18213979` or the truthful unavailable response if TxLINE no longer exposes the history. Verify the Vercel production bundle contains the new finished-history copy and returns HTTP 200.

- [ ] **Step 5: Report evidence**

Report migration status, test counts, PR/merge commit, production URLs, Norway snapshot count/source, and any remaining upstream limitation.
