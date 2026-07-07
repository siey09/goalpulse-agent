# Signal Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an insert-only Supabase archive that appends a permanent copy of every signal at creation and again at settlement, so tournament history survives in-memory caps and TxLINE's live-rotation window, without touching the existing snapshot persistence, settlement logic, or signal generation.

**Architecture:** A new `signal_archive` table (pure insert, never upserted/updated/deleted) and a new `apps/api/src/services/archive.ts` module mirroring `persistence.ts`'s exact fail-open conventions. Two fire-and-forget call sites, both in `agent.ts` only, driven by two new small pure functions there (`findPendingSignals`, `findNewlySettledSignals`) that detect settlement transitions via object-reference comparison — `store.ts` is never touched.

**Tech Stack:** TypeScript, `@supabase/supabase-js` (already a dependency, used by `persistence.ts`), Vitest (existing stack, no new dependencies).

## Global Constraints

- Insert-only: never `upsert`, `update`, or `delete` against `signal_archive` (spec: "Goals", Decision #1).
- Must not touch or modify `persistence.ts`, `store_snapshots`, `store.ts` (including `evaluatePendingSignalsForFinishedMatches`), or `signalEngine.ts` (spec: "Goals", "Non-goals", Decision #2).
- Signal creation and settlement archive writes are both triggered from `agent.ts` only — settlement detection uses an object-reference before/after diff, never touching `store.ts` (spec: Decision #2).
- Both archive call sites are fire-and-forget (`void archiveSignal(...)`, not awaited) — a Supabase outage must never delay or break the agent cycle (spec: "Design").
- Schema is the hybrid shape exactly as specified: `signal_id`, `event`, `match_id`, `side`, `signal_type`, `severity`, `result_status`, `momentum_score`, `odds_change_pct` as real columns, plus a full `signal_data jsonb` column (spec: Decision #3).
- Signals only — no `match_archive` table, no match-archiving logic (spec: Decision #4).
- No new endpoint, no dashboard panel, no `/health` change (spec: Decision #5).
- Adding `findPendingSignals`/`findNewlySettledSignals` as new named exports from `agent.ts` must not change `processAgentCycle`'s signature or require any change to its one existing call site (`server.ts:7`) (spec: "Confirmed facts").

---

### Task 1: Archive module and schema

**Files:**
- Modify: `apps/api/supabase-schema.sql`
- Create: `apps/api/src/services/archive.ts`
- Create: `apps/api/src/services/archive.test.ts`

**Interfaces:**
- Produces: `archiveSignal(signal: AgentSignal, event: ArchiveEvent): Promise<void>` and `export type ArchiveEvent = "created" | "settled"`, both exported from `apps/api/src/services/archive.ts`. Task 2 imports both.

- [ ] **Step 1: Add the schema**

In `apps/api/supabase-schema.sql`, the file currently reads in full:

```sql
-- Run this once in the Supabase SQL editor for your project, before setting
-- SUPABASE_URL/SUPABASE_SERVICE_KEY. Single-row table (always id = 1),
-- upserted on every snapshot write - never grows, no cleanup needed.
create table if not exists store_snapshots (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

Replace with (adding the new table after the existing one):

```sql
-- Run this once in the Supabase SQL editor for your project, before setting
-- SUPABASE_URL/SUPABASE_SERVICE_KEY. Single-row table (always id = 1),
-- upserted on every snapshot write - never grows, no cleanup needed.
create table if not exists store_snapshots (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Insert-only permanent archive: one row per signal per lifecycle event
-- (created, settled). Never upserted, updated, or deleted - grows for the
-- rest of the tournament, independent of any in-memory cap.
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

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/services/archive.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  })),
}));

import { config } from "../config";
import { archiveSignal } from "./archive";
import type { AgentSignal } from "../types";

function makeSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("archiveSignal", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    insertMock.mockReset();
  });

  it("no-ops when Supabase is not configured", async () => {
    await archiveSignal(makeSignal(), "created");

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the correct row shape when configured", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockResolvedValue({ error: null });

    const signal = makeSignal({
      id: "signal-42",
      matchId: "match-7",
      side: "away",
      signalType: "MOMENTUM_SHIFT",
      severity: "MEDIUM",
      resultStatus: "correct",
      momentumScore: 63.5,
      oddsChangePct: 12.25,
    });

    await archiveSignal(signal, "settled");

    expect(insertMock).toHaveBeenCalledWith({
      signal_id: "signal-42",
      event: "settled",
      match_id: "match-7",
      side: "away",
      signal_type: "MOMENTUM_SHIFT",
      severity: "MEDIUM",
      result_status: "correct",
      momentum_score: 63.5,
      odds_change_pct: 12.25,
      signal_data: signal,
    });
  });

  it("does not throw when the mocked insert rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockRejectedValue(new Error("network error"));

    await expect(archiveSignal(makeSignal(), "created")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/services/archive.test.ts`
Expected: FAIL — `archive.test.ts` cannot resolve `./archive` (module does not exist yet).

- [ ] **Step 4: Write the archive module**

Create `apps/api/src/services/archive.ts`:

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/services/archive.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 6: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 62 tests pass (59 existing + 3 new).

- [ ] **Step 8: Commit**

```bash
git add apps/api/supabase-schema.sql apps/api/src/services/archive.ts apps/api/src/services/archive.test.ts
git commit -m "Add insert-only signal_archive table and archiveSignal module"
```

---

### Task 2: Wire archiving into agent.ts's creation and settlement points

**Files:**
- Modify: `apps/api/src/agent.ts`
- Create: `apps/api/src/agent.test.ts`

**Interfaces:**
- Consumes: `archiveSignal`, `ArchiveEvent` from `./services/archive` (Task 1).
- Produces: `findPendingSignals(signals: AgentSignal[]): AgentSignal[]` and `findNewlySettledSignals(signalsCapturedWhilePending: AgentSignal[]): AgentSignal[]`, both new named exports from `apps/api/src/agent.ts`, alongside the existing unchanged `processAgentCycle` export.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/agent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findNewlySettledSignals, findPendingSignals } from "./agent";
import type { AgentSignal } from "./types";

function makeSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test signal",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("findPendingSignals", () => {
  it("returns only signals with resultStatus 'pending' from a mixed list", () => {
    const pending = makeSignal({ id: "signal-pending", resultStatus: "pending" });
    const correct = makeSignal({ id: "signal-correct", resultStatus: "correct" });
    const incorrect = makeSignal({ id: "signal-incorrect", resultStatus: "incorrect" });

    const result = findPendingSignals([pending, correct, incorrect]);

    expect(result).toEqual([pending]);
  });
});

describe("findNewlySettledSignals", () => {
  it("detects a signal whose resultStatus was mutated away from pending after being captured", () => {
    const signal = makeSignal({ id: "signal-1", resultStatus: "pending" });
    const capturedWhilePending = [signal];

    // Simulates evaluatePendingSignalsForFinishedMatches mutating the same
    // object in place, the way store.ts actually does it.
    signal.resultStatus = "correct";

    const result = findNewlySettledSignals(capturedWhilePending);

    expect(result).toEqual([signal]);
  });

  it("excludes a signal that is still pending", () => {
    const stillPending = makeSignal({ id: "signal-2", resultStatus: "pending" });
    const capturedWhilePending = [stillPending];

    const result = findNewlySettledSignals(capturedWhilePending);

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/agent.test.ts`
Expected: FAIL — `findPendingSignals`/`findNewlySettledSignals` are not exported from `./agent` yet.

- [ ] **Step 3: Add the two pure functions and the archive import**

In `apps/api/src/agent.ts`, find:

```ts
import { config } from "./config";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { fetchSimulatedTxLineFeed } from "./services/mockTxLine";
import { fetchTxLineFeed } from "./services/txlineClient";
import { sendHighSeverityAlert } from "./services/alerts";
import {
  evaluatePendingSignalsForFinishedMatches,
  findPreviousSnapshot,
  signalAlreadyExists,
  snapshotAlreadyExists,
  upsertRecentFinishedMatches,
  store,
} from "./store";
import { AgentRun } from "./types";

export async function processAgentCycle(): Promise<AgentRun> {
```

Replace with:

```ts
import { config } from "./config";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { fetchSimulatedTxLineFeed } from "./services/mockTxLine";
import { fetchTxLineFeed } from "./services/txlineClient";
import { sendHighSeverityAlert } from "./services/alerts";
import { archiveSignal } from "./services/archive";
import {
  evaluatePendingSignalsForFinishedMatches,
  findPreviousSnapshot,
  signalAlreadyExists,
  snapshotAlreadyExists,
  upsertRecentFinishedMatches,
  store,
} from "./store";
import { AgentRun, AgentSignal } from "./types";

export function findPendingSignals(signals: AgentSignal[]): AgentSignal[] {
  return signals.filter((signal) => signal.resultStatus === "pending");
}

/**
 * Takes signal objects already known to have been "pending" at some earlier
 * point (by reference, not id - sidesteps the known duplicate-signal-id
 * behavior from stale-finished-match repolling, since this only ever
 * inspects the exact objects it was given) and returns the ones that have
 * since transitioned away from "pending" via evaluatePendingSignalsForFinishedMatches
 * mutating them in place.
 */
export function findNewlySettledSignals(
  signalsCapturedWhilePending: AgentSignal[]
): AgentSignal[] {
  return signalsCapturedWhilePending.filter(
    (signal) => signal.resultStatus !== "pending"
  );
}

export async function processAgentCycle(): Promise<AgentRun> {
```

- [ ] **Step 4: Wire the creation-time archive call**

In `apps/api/src/agent.ts`, find:

```ts
      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;

        if (signal.severity === "HIGH") {
```

Replace with:

```ts
      if (signal && !signalAlreadyExists(signal)) {
        store.signals.unshift(signal);
        signalsCreated += 1;
        void archiveSignal(signal, "created");

        if (signal.severity === "HIGH") {
```

- [ ] **Step 5: Wire the settlement-time archive call**

In `apps/api/src/agent.ts`, find:

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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npx vitest run src/agent.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 7: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 8: Run the full test suite to check for regressions**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 65 tests pass (62 from Task 1 + 3 new).

Note: same as this session's prior Supabase/TxLINE-dependent work — this cannot be manually smoke-tested against a live TxLINE feed or a live Supabase table from this environment (no real `TXLINE_API_KEY`/`SUPABASE_SERVICE_KEY` available here). The build passing plus the full suite staying green is the correct and sufficient verification for this task; the user verifies the live Supabase writes directly by browsing the `signal_archive` table after deployment, per the spec's stated verification approach.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/agent.ts apps/api/src/agent.test.ts
git commit -m "Archive signals to Supabase at creation and settlement, via agent.ts only"
```

---

## Self-Review

**Spec coverage:**
- Insert-only schema, hybrid columns + jsonb blob (spec: Decision #3) → Task 1, Step 1.
- `archiveSignal`/`ArchiveEvent` fail-open module (spec: "Design") → Task 1, Step 4.
- Archive twice (created + settled), reference-based diff, `store.ts` untouched (spec: Decision #1, #2) → Task 2, Steps 3-5.
- `processAgentCycle`'s signature and `server.ts`'s only call site unaffected (spec: "Confirmed facts") → Task 2, Step 3 (only new named exports added; `processAgentCycle`'s own declaration line is untouched, appearing identically before and after the diff).
- Both call sites fire-and-forget (spec: "Design") → Task 2, Steps 4-5 (`void archiveSignal(...)` at both).
- No changes to `persistence.ts`/`store_snapshots`/`store.ts`/`signalEngine.ts`, no `match_archive` table, no new endpoint/panel/`/health` change (spec: "Non-goals") → confirmed, this plan's only file changes are `supabase-schema.sql`, `archive.ts`, `archive.test.ts`, `agent.ts`, `agent.test.ts`.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, either copied verbatim from the actual current file contents (confirmed by reading them during planning) or fully written new content.

**Type consistency:** `archiveSignal(signal: AgentSignal, event: ArchiveEvent): Promise<void>` is defined once in Task 1 Step 4 and consumed identically in Task 2 Steps 4-5. `findPendingSignals(signals: AgentSignal[]): AgentSignal[]` and `findNewlySettledSignals(signalsCapturedWhilePending: AgentSignal[]): AgentSignal[]` are defined once in Task 2 Step 3 and used with matching argument types at their two call sites (`store.signals` is `AgentSignal[]`; the loop variable from `findNewlySettledSignals` is typed `AgentSignal`, matching `archiveSignal`'s first parameter).
