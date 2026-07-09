# Match Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an insert-only `match_archive` Supabase table that permanently records every match's final state the first time it's observed as `"finished"`, closing the gap where a match with zero signals leaves no permanent record once it ages out of the in-memory 20-cap `recentFinishedMatches` or the process restarts.

**Architecture:** `store.ts`'s existing `upsertRecentFinishedMatches` changes from `void` to returning `Match[]` — the matches newly transitioning to finished on that call, computed as a pure diff against the pre-update state. A new `archiveMatch()` in `services/archive.ts` (same fail-open Supabase contract as the existing `archiveSignal`) is then called from all three existing callers of `upsertRecentFinishedMatches` using that return value.

**Tech Stack:** Node.js/Express/TypeScript backend, Supabase (`@supabase/supabase-js`), Vitest.

## Global Constraints

- Insert-only: `match_archive` rows are never updated or deleted, matching `signal_archive`'s existing convention.
- Fail-open: `archiveMatch` must never throw and must never block or fail its caller — no-op if Supabase is unconfigured, catch+log on any Supabase error.
- `store.ts` stays fully synchronous — no Supabase/async import enters that file. The diff logic returns plain data; the async archive call happens at the caller.
- No new read endpoint, no dashboard panel, no wiring into Arena's backtest — write path only, per the approved spec (`docs/superpowers/specs/2026-07-10-match-archive-design.md`).

---

### Task 1: `upsertRecentFinishedMatches` returns newly-finished matches

**Files:**
- Modify: `apps/api/src/store.ts:50-71`
- Test: `apps/api/src/store.test.ts`

**Interfaces:**
- Produces: `upsertRecentFinishedMatches(matches: Match[]): Match[]` (was `: void`) — returns the subset of `matches` with `status === "finished"` whose `id` was **not** already present in `store.recentFinishedMatches` before this call. Order of the returned array is not significant to later tasks.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to `apps/api/src/store.test.ts`, right after the existing `import` statements changes below and before the first existing `describe` block. First, update the import line to pull in `upsertRecentFinishedMatches`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { store, evaluatePendingSignalsForFinishedMatches, upsertRecentFinishedMatches } from "./store";
import type { AgentSignal, Match } from "./types";
```

Then add the new test block (the existing `makeMatch`/`makeSignal` helpers and `beforeEach` already in the file stay as-is; this block goes anywhere at the top level, e.g. right before the existing `describe("evaluatePendingSignalsForFinishedMatches — 1X2 market", ...)` block):

```ts
describe("upsertRecentFinishedMatches", () => {
  it("returns a match not previously seen as finished", () => {
    const match = makeMatch({ id: "match-1", status: "finished" });

    const result = upsertRecentFinishedMatches([match]);

    expect(result).toEqual([match]);
  });

  it("does not re-return a match already recorded as finished on a later call", () => {
    const match = makeMatch({ id: "match-1", status: "finished" });
    upsertRecentFinishedMatches([match]);

    const result = upsertRecentFinishedMatches([match]);

    expect(result).toEqual([]);
  });

  it("excludes a still-live match from the return value", () => {
    const liveMatch = makeMatch({ id: "match-2", status: "live" });

    const result = upsertRecentFinishedMatches([liveMatch]);

    expect(result).toEqual([]);
    expect(store.recentFinishedMatches).toEqual([]);
  });

  it("returns only the genuinely newly-finished matches from a mixed batch", () => {
    const alreadyFinished = makeMatch({ id: "match-1", status: "finished" });
    upsertRecentFinishedMatches([alreadyFinished]);

    const stillLive = makeMatch({ id: "match-2", status: "live" });
    const newlyFinished = makeMatch({ id: "match-3", status: "finished" });

    const result = upsertRecentFinishedMatches([alreadyFinished, stillLive, newlyFinished]);

    expect(result).toEqual([newlyFinished]);
  });

  it("still upserts the finished match into store.recentFinishedMatches as before", () => {
    const match = makeMatch({ id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });

    upsertRecentFinishedMatches([match]);

    expect(store.recentFinishedMatches).toEqual([match]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run store.test.ts`
Expected: FAIL — `upsertRecentFinishedMatches` is not exported with the right behavior yet (TypeScript error importing it if not exported for use here is not the case since it's already exported; the failures will be assertion failures: `result` is `undefined` since the function currently returns nothing).

- [ ] **Step 3: Implement**

Replace `apps/api/src/store.ts:50-71` (the current `upsertRecentFinishedMatches` function) with:

```ts
export function upsertRecentFinishedMatches(matches: Match[]): Match[] {
  const finishedMatches = matches.filter((match) => match.status === "finished");

  const previouslyFinishedIds = new Set(
    store.recentFinishedMatches.map((match) => match.id)
  );
  const newlyFinishedMatches = finishedMatches.filter(
    (match) => !previouslyFinishedIds.has(match.id)
  );

  for (const match of finishedMatches) {
    const existingIndex = store.recentFinishedMatches.findIndex(
      (item) => item.id === match.id
    );

    if (existingIndex >= 0) {
      store.recentFinishedMatches[existingIndex] = match;
    } else {
      store.recentFinishedMatches.unshift(match);
    }
  }

  store.recentFinishedMatches = store.recentFinishedMatches
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    )
    .slice(0, 20);

  return newlyFinishedMatches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run store.test.ts`
Expected: PASS (all tests in the file, including the pre-existing `evaluatePendingSignalsForFinishedMatches` ones, which are unaffected by this change).

- [ ] **Step 5: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. (This will surface any caller relying on the old `void` return type in a way that breaks — none should exist yet, since Task 3 hasn't wired callers to the new return value.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: upsertRecentFinishedMatches returns newly-finished matches"
```

---

### Task 2: `archiveMatch` + `match_archive` schema

**Files:**
- Modify: `apps/api/src/services/archive.ts`
- Modify: `apps/api/supabase-schema.sql`
- Test: `apps/api/src/services/archive.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `archiveMatch(match: Match): Promise<void>`, importable from `apps/api/src/services/archive.ts`, for Task 3 to call.

- [ ] **Step 1: Add the schema (not test-driven — plain SQL, not exercised by the test suite)**

Append to `apps/api/supabase-schema.sql`:

```sql

-- Insert-only permanent archive: one row per match the first time it's
-- observed as finished. Never upserted, updated, or deleted. A match can
-- legitimately get a second row if the process restarts and rediscovers
-- it as "finished" via a backfill route without having seen the live
-- transition - this is accepted, not a bug (see match-archive design spec).
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

- [ ] **Step 2: Write the failing tests**

Add to `apps/api/src/services/archive.test.ts`. First, update the top-level import of `archiveSignal`/`getArchivedSignals`/`isTotalsMatchId` to also pull in `archiveMatch`, and add `Match` to the type import:

```ts
import { archiveMatch, archiveSignal, getArchivedSignals, isTotalsMatchId } from "./archive";
import type { AgentSignal, Match } from "../types";
```

Add a `makeMatch` helper (mirrors the file's existing `makeSignal` helper) and a new `describe("archiveMatch", ...)` block, placed after the existing `describe("archiveSignal", ...)` block:

```ts
function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "World Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 2,
    awayScore: 1,
    minute: 90,
    status: "finished",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe("archiveMatch", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    insertMock.mockReset();
  });

  it("no-ops when Supabase is not configured", async () => {
    await archiveMatch(makeMatch());

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the correct row shape when configured", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockResolvedValue({ error: null });

    const match = makeMatch({
      id: "18198205",
      competition: "FIFA World Cup",
      homeTeam: "France",
      awayTeam: "Morocco",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
    });

    await archiveMatch(match);

    expect(insertMock).toHaveBeenCalledWith({
      match_id: "18198205",
      competition: "FIFA World Cup",
      home_team: "France",
      away_team: "Morocco",
      home_score: 2,
      away_score: 0,
      status: "finished",
      match_data: match,
    });
  });

  it("does not throw when the mocked insert rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockRejectedValue(new Error("network error"));

    await expect(archiveMatch(makeMatch())).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run services/archive.test.ts`
Expected: FAIL — `archiveMatch` does not exist yet (import error / `archiveMatch is not a function`).

- [ ] **Step 4: Implement**

In `apps/api/src/services/archive.ts`, update the top-of-file type import to add `Match`:

```ts
import type { AgentSignal, ArchiveEntry, ArchiveFilters, ArchivePagination, ArchiveQueryResult, Match } from "../types";
```

Add a table-name constant near the existing `ARCHIVE_TABLE` constant:

```ts
const MATCH_ARCHIVE_TABLE = "match_archive";
```

Add the new function, placed after `archiveSignal` (and before `isTotalsMatchId`):

```ts
/**
 * Appends one permanent record of a match's state the first time it's
 * observed as finished - separate from signal_archive, since a match with
 * zero signals otherwise leaves no permanent trace once it ages out of the
 * in-memory recentFinishedMatches cap. Fail-open, same contract as
 * archiveSignal: no-ops if Supabase is not configured, logs but never
 * throws on a delivery failure.
 */
export async function archiveMatch(match: Match): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    await client.from(MATCH_ARCHIVE_TABLE).insert({
      match_id: match.id,
      competition: match.competition,
      home_team: match.homeTeam,
      away_team: match.awayTeam,
      home_score: match.homeScore,
      away_score: match.awayScore,
      status: match.status,
      match_data: { ...match },
    });
  } catch (error) {
    console.error("[archive] Failed to archive match to Supabase:", error);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run services/archive.test.ts`
Expected: PASS (all tests in the file, including the pre-existing `archiveSignal`/`getArchivedSignals`/`isTotalsMatchId` ones).

- [ ] **Step 6: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/archive.ts apps/api/src/services/archive.test.ts apps/api/supabase-schema.sql
git commit -m "feat: add archiveMatch and match_archive schema"
```

---

### Task 3: Wire the write hook into all three callers

**Files:**
- Modify: `apps/api/src/agent.ts:1-46`
- Modify: `apps/api/src/server.ts:39-146` and `apps/api/src/server.ts:658-680`

**Interfaces:**
- Consumes: `upsertRecentFinishedMatches(matches: Match[]): Match[]` (Task 1), `archiveMatch(match: Match): Promise<void>` (Task 2).
- Produces: nothing further consumed by later tasks — this is the final wiring task.

No new automated tests in this task: the pure diff logic already has direct unit coverage from Task 1 (matching the existing codebase convention where `findPendingSignals`/`findNewlySettledSignals` are unit-tested directly but their fire-and-forget `void archiveSignal(...)` call sites inside `processAgentCycle` are not separately mock-and-assert tested). Verification here is the full test suite plus a build, per Step 4 below.

- [ ] **Step 1: Wire `agent.ts`**

In `apps/api/src/agent.ts`, update the import on line 6 to also bring in `archiveMatch`:

```ts
import { archiveMatch, archiveSignal } from "./services/archive";
```

Replace line 45-46:

```ts
    store.matches = feed.matches;
    upsertRecentFinishedMatches(feed.matches);
```

with:

```ts
    store.matches = feed.matches;
    const newlyFinishedMatches = upsertRecentFinishedMatches(feed.matches);
    for (const match of newlyFinishedMatches) {
      void archiveMatch(match);
    }
```

- [ ] **Step 2: Wire `server.ts`**

Update the import on line 39 to also bring in `archiveMatch`:

```ts
import { archiveMatch, getArchivedSignals } from "./services/archive";
```

In the `GET /api/recent-results` handler, replace:

```ts
    upsertRecentFinishedMatches(recentFeed.matches);
```

with:

```ts
    const newlyFinishedMatches = upsertRecentFinishedMatches(recentFeed.matches);
    for (const match of newlyFinishedMatches) {
      void archiveMatch(match);
    }
```

In the `GET /api/replay/backtest` handler, apply the exact same replacement to its own `upsertRecentFinishedMatches(recentFeed.matches);` call (this handler has an independent copy of the same lazy-backfill block, per the existing code structure — both call sites currently call `fetchRecentTxLineResults()` and `upsertRecentFinishedMatches()` identically).

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/api && npm run test`
Expected: PASS, still 18 test files (no new file added — `store.test.ts` and `services/archive.test.ts` both gained new test cases within the existing files), zero failures.

- [ ] **Step 5: Full build check**

Run: `cd apps/api && npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/agent.ts apps/api/src/server.ts
git commit -m "feat: archive matches to match_archive on first observed finish"
```

---

## Final verification (after all tasks)

- [ ] Run `cd apps/api && npm run test` one more time from a clean state — confirm the full suite passes.
- [ ] Run `cd apps/api && npm run build` — confirm clean.
- [ ] Update `PROJECT_STATE.md`: mark the `match_archive` item in "What still needs doing" as done (it currently reads "**`match_archive` table remains available if the user wants it, but was not chosen this round**" in the session handoff, and item 3 in "What still needs doing" — both need updating), and add a short entry to the "Complete feature list" describing what shipped (table, write path, no read endpoint, per this plan).
- [ ] Present the diff for a single end-of-task review before merging, per the user's stated process for this item.
