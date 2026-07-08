# Stale-Finished-Match Repolling Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `fetchTxLineFeed()` from repeatedly reprocessing fixtures already confirmed finished in a prior poll cycle, closing the root cause of duplicate signal generation on stale historical ticks.

**Architecture:** A new pure, exported function in `txlineClient.ts` filters the raw fixture list against `store.matches`'s previous-cycle statuses before `prioritizeLikelyLiveFixtures()` runs. `store` is imported directly into `txlineClient.ts` — already precedented by `persistence.ts`, and confirmed zero circular-dependency risk (`store.ts` has no imports of its own).

**Tech Stack:** Node.js/Express/TypeScript, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-stale-finished-match-repolling-fix-design.md`

## Global Constraints

- The fix lives in `fetchTxLineFeed()`, before `prioritizeLikelyLiveFixtures()` runs — not inside `selectMovementOdds()` or `signalAlreadyExists()`, which stay unchanged.
- No expiry/cooldown logic — finished matches don't un-finish; a fixture only re-enters consideration by naturally rotating out of `store.matches` (at which point it's no longer being reprocessed anyway).
- `fetchRecentTxLineResults()`/`/api/recent-results` (the separate backfill path) is untouched — out of scope.
- This is the first-ever test file for `txlineClient.ts`; only the new pure function gets tests — the rest of the file remains verified against production, per existing convention.
- This repo's docs (`PROJECT_STATE.md`, `TECHNICAL_DOCS.md`) must reflect this fix once merged, including removing the now-resolved "Known limitations" bullet.

---

### Task 1: `filterOutConfirmedFinishedFixtures` and wiring into `fetchTxLineFeed`

**Files:**
- Modify: `apps/api/src/services/txlineClient.ts`
- Create: `apps/api/src/services/txlineClient.test.ts`

**Interfaces:**
- Consumes: `store.matches` (existing, `../store`); `Match` (existing, `../types`).
- Produces: `filterOutConfirmedFinishedFixtures(fixtures: TxLineFixture[], priorMatchesById: Map<string, Match>): TxLineFixture[]` — consumed only by `fetchTxLineFeed()` itself within this same file; nothing outside this task relies on it.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/txlineClient.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { filterOutConfirmedFinishedFixtures } from "./txlineClient";
import type { Match } from "../types";

type TestFixture = { FixtureId: number; StartTime?: number };

function makeFixture(overrides: Partial<TestFixture> = {}): TestFixture {
  return { FixtureId: 1, ...overrides };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 90,
    status: "finished",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe("filterOutConfirmedFinishedFixtures", () => {
  it("passes through a fixture with no prior match entry at all", () => {
    const fixtures = [makeFixture({ FixtureId: 99 })];
    const priorMatchesById = new Map<string, Match>();

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
    expect(result[0].FixtureId).toBe(99);
  });

  it("passes through a fixture whose prior match status was live", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "live" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
  });

  it("passes through a fixture whose prior match status was scheduled", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "scheduled" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(1);
  });

  it("filters out a fixture whose prior match status was finished", () => {
    const fixtures = [makeFixture({ FixtureId: 1 })];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "finished" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result).toHaveLength(0);
  });

  it("filters a mixed batch correctly, preserving relative order", () => {
    const fixtures = [
      makeFixture({ FixtureId: 1 }),
      makeFixture({ FixtureId: 2 }),
      makeFixture({ FixtureId: 3 }),
      makeFixture({ FixtureId: 4 }),
    ];
    const priorMatchesById = new Map<string, Match>([
      ["1", makeMatch({ id: "1", status: "finished" })],
      ["2", makeMatch({ id: "2", status: "live" })],
      ["3", makeMatch({ id: "3", status: "finished" })],
    ]);

    const result = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);

    expect(result.map((fixture) => fixture.FixtureId)).toEqual([2, 4]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/txlineClient.test.ts
```

Expected: FAIL — `filterOutConfirmedFinishedFixtures` is not exported from `./txlineClient` yet.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/services/txlineClient.ts`, find the existing imports at the top of the file:

```typescript
import { config } from "../config";
import { Match, OddsSnapshot, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "../logic/scoresContextFreshness";
```

Replace with:

```typescript
import { config } from "../config";
import { Match, OddsSnapshot, TxLineScoresContext } from "../types";
import { isScoresContextFresh, SCORES_CONTEXT_TOLERANCE_MS } from "../logic/scoresContextFreshness";
import { store } from "../store";
```

Then find `prioritizeLikelyLiveFixtures`'s definition (search for
`function prioritizeLikelyLiveFixtures`) and add the new function
immediately before it:

```typescript
/**
 * A fixture already confirmed finished in the previous poll cycle's
 * store.matches should never be reprocessed - prioritizeLikelyLiveFixtures
 * only re-ranks by a StartTime heuristic, it never filters, so without
 * this a long-finished fixture can keep occupying a rotation slot
 * indefinitely, wasting TxLINE calls and eventually producing a "new"
 * signal for the same historical tick once it outlives the odds-cache
 * and dedup windows. Matched by fixture ID against whatever store.matches
 * held at the start of this cycle (agent.ts replaces store.matches with
 * this cycle's own results only after fetchTxLineFeed returns, so the
 * previous cycle's confirmed statuses are still there to read).
 */
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

Then find, inside `fetchTxLineFeed()`:

```typescript
  const jwt = await getGuestJwt();
  const fixtures = await txlineGet<TxLineFixture[]>("/api/fixtures/snapshot", jwt);
  const prioritizedFixtures = prioritizeLikelyLiveFixtures(fixtures);
```

Replace with:

```typescript
  const jwt = await getGuestJwt();
  const fixtures = await txlineGet<TxLineFixture[]>("/api/fixtures/snapshot", jwt);
  const priorMatchesById = new Map(store.matches.map((match) => [match.id, match]));
  const liveFixtures = filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById);
  const prioritizedFixtures = prioritizeLikelyLiveFixtures(liveFixtures);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/txlineClient.test.ts
```

Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full test suite and build to confirm no regressions**

```bash
cd apps/api && npm run test && npm run build
```

Expected: all test files pass (total test count higher than the
pre-existing 161); clean `tsc` build, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/txlineClient.ts apps/api/src/services/txlineClient.test.ts
git commit -m "Filter confirmed-finished fixtures out of the live poll rotation"
```

---

### Task 2: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `TECHNICAL_DOCS.md`

**Interfaces:**
- Consumes: Task 1 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass. Note the exact new total test count (was
161 before this fix, across 17 files) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In `TECHNICAL_DOCS.md`, find this exact bullet (in the "Known Issues
Fixed"/"Known limitations" section):

```
- **Stale-finished-match repolling.** A long-finished fixture can still be included in `fetchTxLineFeed()`'s live poll rotation. `selectMovementOdds` re-selects the single strongest historical compression pair on every poll regardless of recency, so once its `OddsSnapshot` ages out of the shared 800-entry cache and more than `signalAlreadyExists`'s 6-hour dedup window has passed, a "new" `AgentSignal` gets created for the exact same historical tick with a fresh `createdAt`. Not a bug in the scores-context freshness fix (which correctly gates the mismatched context in this scenario) — a separate, pre-existing characteristic of the live-polling/dedup design.
```

Replace it with a "fixed" note describing the actual fix (move it out of
"Known limitations" into whatever "Known Issues Fixed" section already
documents the StatusId 100 and snapshot-ordering fixes, matching that
section's existing style): reference
`filterOutConfirmedFinishedFixtures` in `txlineClient.ts`, the
`store.matches`-from-the-previous-cycle mechanism, and the spec/plan file
paths.

Update the test count line (`**161 tests across 17 files**...`) to the
real number measured in Step 1, and add `services/txlineClient.test.ts`
to that file list (it's currently absent since this is the first test
file for that service).

In `PROJECT_STATE.md`:
- Update `## What still needs doing` item 4 (stale-finished-match
  repolling fix) to reflect it's now done — change to past tense,
  reference `apps/api/src/services/txlineClient.ts`'s
  `filterOutConfirmedFinishedFixtures` and this plan/spec's file paths.
- Update the test count/file references to match Step 1's real number.
- Update the handoff status block per the standing update-cadence
  instruction: mark this fix done, and note that all explicitly-flagged
  "What still needs doing" items are now resolved (only the deliberately
  deferred `match_archive` table item remains, which needs no action).

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md TECHNICAL_DOCS.md
git commit -m "Document the stale-finished-match repolling fix"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the
entire branch's diff (both tasks' commits together) before merging to
`main` — do not merge without it.
