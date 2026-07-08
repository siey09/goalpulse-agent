# GET /api/archive Read Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paginated, filterable `GET /api/archive` endpoint over the existing insert-only `signal_archive` Supabase table, which currently has no read path at all.

**Architecture:** A new pure query-parsing module (`logic/paginationParams.ts`) turns raw Express query params into typed filters/pagination. A new `getArchivedSignals()` function in the existing `services/archive.ts` (alongside `archiveSignal()`) builds and runs the Supabase query, converting rows from snake_case to the camelCase shape the rest of this API already uses. `server.ts` wires the route. All three layers are independently unit-testable with no real Supabase connection required.

**Tech Stack:** Node.js/Express/TypeScript, `@supabase/supabase-js`, Vitest.

**Full design reference:** `docs/superpowers/specs/2026-07-08-archive-read-endpoint-design.md`

## Global Constraints

- Response envelope matches every existing route: `{ data: ... }`, extended here with a `pagination` object — copied verbatim from the spec's Response Shape section.
- Row keys in the API response are camelCase, converted from the table's snake_case columns (`signal_id` → `signalId`, etc.) — spec's "Response shape" section.
- Endpoint is a public GET, no `X-API-Key`, no new rate limiter — covered by the existing general 1200/min limiter already applied globally in `server.ts` (`app.use(generalApiLimiter)`).
- Fail-open: if Supabase is unconfigured or the query throws, return HTTP 200 with `data: []` and `pagination.totalCount: 0` — never a 4xx/5xx. Matches `archiveSignal`'s and `persistence.ts`'s existing fail-open convention.
- Default sort: `archivedAt` descending (newest first).
- `market` filter is inferred from `match_id` containing `-totals-` — no schema change, no new column.
- `page` default `1`, `pageSize` default `25` capped at `100`; invalid/negative input clamps to the default rather than erroring.
- All new pure logic goes in `apps/api/src/logic/` per this codebase's existing convention (small, independently-testable modules with no I/O).
- Test runner: Vitest, run from `apps/api/` via `npm run test` (or `npx vitest run <path>` for a single file).
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged — established convention this session, see the final task.

---

### Task 1: `parsePageParam` / `parsePageSizeParam` / `parseArchiveFilters` in `logic/paginationParams.ts`

**Files:**
- Create: `apps/api/src/logic/paginationParams.ts`
- Create: `apps/api/src/logic/paginationParams.test.ts`
- Modify: `apps/api/src/types.ts` (add `ArchiveFilters` type, consumed by this task and Task 2)

**Interfaces:**
- Consumes: nothing (pure functions, no dependencies on other new code).
- Produces: `parsePageParam(raw: unknown): number`, `parsePageSizeParam(raw: unknown): number`, `parseArchiveFilters(query: Record<string, unknown>): ArchiveFilters` — all three consumed directly by Task 3 (the route handler). `ArchiveFilters` type is also consumed by Task 2's `getArchivedSignals`.

- [ ] **Step 1: Add the `ArchiveFilters` type to `types.ts`**

Add this near the other interfaces in `apps/api/src/types.ts` (e.g. right after `AgentSignal`):

```typescript
export interface ArchiveFilters {
  matchId?: string;
  status?: "pending" | "correct" | "incorrect";
  market?: "1x2" | "totals";
  event?: "created" | "settled";
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/logic/paginationParams.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parsePageParam, parsePageSizeParam, parseArchiveFilters } from "./paginationParams";

describe("parsePageParam", () => {
  it("defaults to 1 when raw is undefined", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("defaults to 1 when raw is not a finite number", () => {
    expect(parsePageParam("not-a-number")).toBe(1);
  });

  it("defaults to 1 when raw is zero or negative", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
  });

  it("floors a valid fractional page", () => {
    expect(parsePageParam("3.9")).toBe(3);
  });

  it("passes through a valid integer page as a number", () => {
    expect(parsePageParam("2")).toBe(2);
  });
});

describe("parsePageSizeParam", () => {
  it("defaults to 25 when raw is undefined", () => {
    expect(parsePageSizeParam(undefined)).toBe(25);
  });

  it("defaults to 25 when raw is not a finite number or is less than 1", () => {
    expect(parsePageSizeParam("not-a-number")).toBe(25);
    expect(parsePageSizeParam("0")).toBe(25);
    expect(parsePageSizeParam("-10")).toBe(25);
  });

  it("caps at 100 for a larger requested pageSize", () => {
    expect(parsePageSizeParam("500")).toBe(100);
  });

  it("floors a valid fractional pageSize", () => {
    expect(parsePageSizeParam("10.7")).toBe(10);
  });
});

describe("parseArchiveFilters", () => {
  it("returns an empty object when no recognized query params are present", () => {
    expect(parseArchiveFilters({})).toEqual({});
  });

  it("includes matchId only when it is a non-empty string", () => {
    expect(parseArchiveFilters({ matchId: "match-1" })).toEqual({ matchId: "match-1" });
    expect(parseArchiveFilters({ matchId: "" })).toEqual({});
    expect(parseArchiveFilters({ matchId: undefined })).toEqual({});
  });

  it("includes status only when it is one of the three valid values", () => {
    expect(parseArchiveFilters({ status: "correct" })).toEqual({ status: "correct" });
    expect(parseArchiveFilters({ status: "pending" })).toEqual({ status: "pending" });
    expect(parseArchiveFilters({ status: "incorrect" })).toEqual({ status: "incorrect" });
    expect(parseArchiveFilters({ status: "bogus" })).toEqual({});
  });

  it("includes market only when it is 1x2 or totals", () => {
    expect(parseArchiveFilters({ market: "1x2" })).toEqual({ market: "1x2" });
    expect(parseArchiveFilters({ market: "totals" })).toEqual({ market: "totals" });
    expect(parseArchiveFilters({ market: "bogus" })).toEqual({});
  });

  it("includes event only when it is created or settled", () => {
    expect(parseArchiveFilters({ event: "created" })).toEqual({ event: "created" });
    expect(parseArchiveFilters({ event: "settled" })).toEqual({ event: "settled" });
    expect(parseArchiveFilters({ event: "bogus" })).toEqual({});
  });

  it("combines multiple valid filters together", () => {
    expect(
      parseArchiveFilters({ matchId: "match-1", status: "correct", market: "totals", event: "settled" })
    ).toEqual({ matchId: "match-1", status: "correct", market: "totals", event: "settled" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/logic/paginationParams.test.ts
```

Expected: FAIL — `Cannot find module './paginationParams'` (the file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/logic/paginationParams.ts`:

```typescript
import type { ArchiveFilters } from "../types";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parsePageParam(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE;
}

export function parsePageSizeParam(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function parseArchiveFilters(query: Record<string, unknown>): ArchiveFilters {
  const filters: ArchiveFilters = {};

  if (typeof query.matchId === "string" && query.matchId.length > 0) {
    filters.matchId = query.matchId;
  }

  if (query.status === "pending" || query.status === "correct" || query.status === "incorrect") {
    filters.status = query.status;
  }

  if (query.market === "1x2" || query.market === "totals") {
    filters.market = query.market;
  }

  if (query.event === "created" || query.event === "settled") {
    filters.event = query.event;
  }

  return filters;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/logic/paginationParams.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/paginationParams.ts apps/api/src/logic/paginationParams.test.ts apps/api/src/types.ts
git commit -m "Add pure query-param parsing for the archive read endpoint"
```

---

### Task 2: `isTotalsMatchId` + `getArchivedSignals` in `services/archive.ts`

**Files:**
- Modify: `apps/api/src/services/archive.ts`
- Modify: `apps/api/src/services/archive.test.ts`
- Modify: `apps/api/src/types.ts` (add `ArchiveEntry`, `ArchiveQueryResult`, `ArchivePagination` types)

**Interfaces:**
- Consumes: `ArchiveFilters` (from Task 1, `../types`), `AgentSignal` (existing, `../types`).
- Produces: `isTotalsMatchId(matchId: string): boolean`, `getArchivedSignals(filters: ArchiveFilters, pagination: ArchivePagination): Promise<ArchiveQueryResult>` — both consumed by Task 3's route handler.

- [ ] **Step 1: Add the remaining archive types to `types.ts`**

Add these to `apps/api/src/types.ts`, right after the `ArchiveFilters` interface added in Task 1:

```typescript
export interface ArchivePagination {
  page: number;
  pageSize: number;
}

export interface ArchiveEntry {
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: TeamSide;
  signalType: SignalType;
  severity: Severity;
  resultStatus: "pending" | "correct" | "incorrect";
  momentumScore: number;
  oddsChangePct: number;
  archivedAt: string;
  signalData: AgentSignal;
}

export interface ArchiveQueryResult {
  data: ArchiveEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}
```

- [ ] **Step 2: Write the failing tests**

Replace the top of `apps/api/src/services/archive.test.ts` (the `vi.mock("@supabase/supabase-js", ...)` block and imports) with a version that also supports a chainable select/query builder, and add the new test suites below the existing `archiveSignal` describe block. The full new file contents:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
let queryResult: { data: unknown[] | null; count: number | null; error: unknown } = {
  data: [],
  count: 0,
  error: null,
};

function makeQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.like = vi.fn(chain);
  builder.not = vi.fn(chain);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(queryResult).then(resolve, reject);
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertMock,
      ...makeQueryBuilder(),
    })),
  })),
}));

import { config } from "../config";
import { archiveSignal, getArchivedSignals, isTotalsMatchId } from "./archive";
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
    queryResult = { data: [], count: 0, error: null };
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

  it("snapshots signal_data at call time, unaffected by later mutation of the same object", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    insertMock.mockResolvedValue({ error: null });

    const signal = makeSignal({ resultStatus: "pending" });

    await archiveSignal(signal, "created");

    signal.resultStatus = "correct";

    const insertedRow = insertMock.mock.calls[0][0] as { signal_data: AgentSignal };
    expect(insertedRow.signal_data.resultStatus).toBe("pending");
  });
});

describe("isTotalsMatchId", () => {
  it("returns false for a plain 1X2 matchId", () => {
    expect(isTotalsMatchId("fixture-123")).toBe(false);
  });

  it("returns true for a totals matchId", () => {
    expect(isTotalsMatchId("fixture-123-totals-3.5")).toBe(true);
  });
});

describe("getArchivedSignals", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    queryResult = { data: [], count: 0, error: null };
  });

  it("returns empty data and zero totalCount when Supabase is not configured", async () => {
    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 0 },
    });
  });

  it("maps snake_case rows to the camelCase ArchiveEntry shape", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    const rawSignal = makeSignal({ id: "signal-9" });
    queryResult = {
      data: [
        {
          signal_id: "signal-9",
          event: "settled",
          match_id: "match-9",
          side: "home",
          signal_type: "SHARP_MOVE",
          severity: "HIGH",
          result_status: "correct",
          momentum_score: 75,
          odds_change_pct: 18.4,
          signal_data: rawSignal,
          archived_at: "2026-07-08T12:00:00.000Z",
        },
      ],
      count: 1,
      error: null,
    };

    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [
        {
          signalId: "signal-9",
          event: "settled",
          matchId: "match-9",
          side: "home",
          signalType: "SHARP_MOVE",
          severity: "HIGH",
          resultStatus: "correct",
          momentumScore: 75,
          oddsChangePct: 18.4,
          archivedAt: "2026-07-08T12:00:00.000Z",
          signalData: rawSignal,
        },
      ],
      pagination: { page: 1, pageSize: 25, totalCount: 1, totalPages: 1 },
    });
  });

  it("computes totalPages from totalCount and pageSize", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    queryResult = { data: [], count: 143, error: null };

    const result = await getArchivedSignals({}, { page: 2, pageSize: 25 });

    expect(result.pagination).toEqual({ page: 2, pageSize: 25, totalCount: 143, totalPages: 6 });
  });

  it("returns empty data and zero totalCount when the query errors", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";
    queryResult = { data: null, count: null, error: new Error("supabase down") };

    const result = await getArchivedSignals({}, { page: 1, pageSize: 25 });

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 0 },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/archive.test.ts
```

Expected: FAIL — `getArchivedSignals` and `isTotalsMatchId` are not exported from `./archive` yet.

- [ ] **Step 4: Write the implementation**

Replace the full contents of `apps/api/src/services/archive.ts`:

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { AgentSignal, ArchiveEntry, ArchiveFilters, ArchivePagination, ArchiveQueryResult } from "../types";

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
      signal_data: { ...signal },
    });
  } catch (error) {
    console.error("[archive] Failed to archive signal to Supabase:", error);
  }
}

/**
 * Totals signals use a matchId of the form <fixtureId>-totals-<line> (see
 * agent.ts/arena.ts's existing multi-market convention) - there is no
 * dedicated market column on signal_archive, so market filtering is done by
 * checking for this substring rather than requiring a schema migration.
 */
export function isTotalsMatchId(matchId: string): boolean {
  return matchId.includes("-totals-");
}

interface ArchiveRow {
  signal_id: string;
  event: "created" | "settled";
  match_id: string;
  side: ArchiveEntry["side"];
  signal_type: ArchiveEntry["signalType"];
  severity: ArchiveEntry["severity"];
  result_status: ArchiveEntry["resultStatus"];
  momentum_score: number;
  odds_change_pct: number;
  signal_data: AgentSignal;
  archived_at: string;
}

function mapArchiveRow(row: ArchiveRow): ArchiveEntry {
  return {
    signalId: row.signal_id,
    event: row.event,
    matchId: row.match_id,
    side: row.side,
    signalType: row.signal_type,
    severity: row.severity,
    resultStatus: row.result_status,
    momentumScore: row.momentum_score,
    oddsChangePct: row.odds_change_pct,
    archivedAt: row.archived_at,
    signalData: row.signal_data,
  };
}

function emptyResult(pagination: ArchivePagination): ArchiveQueryResult {
  return {
    data: [],
    pagination: { ...pagination, totalCount: 0, totalPages: 0 },
  };
}

/**
 * Reads back rows from the insert-only signal_archive table: raw event-log
 * rows (a signal usually appears twice, once per "created"/"settled" event),
 * never collapsed - the caller filters by event if they only want one state.
 * Fail-open: returns an empty page (never throws/errors) if Supabase is
 * unconfigured or the query itself fails, matching archiveSignal's existing
 * fail-open convention.
 */
export async function getArchivedSignals(
  filters: ArchiveFilters,
  pagination: ArchivePagination
): Promise<ArchiveQueryResult> {
  const client = getClient();

  if (!client) {
    return emptyResult(pagination);
  }

  const from = (pagination.page - 1) * pagination.pageSize;
  const to = from + pagination.pageSize - 1;

  let query = client
    .from(ARCHIVE_TABLE)
    .select("*", { count: "exact" })
    .order("archived_at", { ascending: false })
    .range(from, to);

  if (filters.matchId) query = query.eq("match_id", filters.matchId);
  if (filters.status) query = query.eq("result_status", filters.status);
  if (filters.event) query = query.eq("event", filters.event);
  if (filters.market === "totals") query = query.like("match_id", "%-totals-%");
  if (filters.market === "1x2") query = query.not("match_id", "like", "%-totals-%");

  try {
    const { data, count, error } = await query;

    if (error || !data) {
      console.error("[archive] Failed to read signal_archive from Supabase:", error);
      return emptyResult(pagination);
    }

    return {
      data: (data as ArchiveRow[]).map(mapArchiveRow),
      pagination: {
        ...pagination,
        totalCount: count ?? 0,
        totalPages: count ? Math.ceil(count / pagination.pageSize) : 0,
      },
    };
  } catch (error) {
    console.error("[archive] Failed to read signal_archive from Supabase:", error);
    return emptyResult(pagination);
  }
}
```

Note: `isTotalsMatchId` is defined but not yet called from `getArchivedSignals` — the market filter uses `.like`/`.not` directly against the query builder (server-side filtering, since Supabase does the substring match in Postgres). `isTotalsMatchId` exists as the single source of truth for what "totals" means, for reuse by anything client-side that needs the same check on an already-fetched row.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/archive.test.ts
```

Expected: PASS, all tests green (existing 4 `archiveSignal` tests plus the new `isTotalsMatchId`/`getArchivedSignals` tests).

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
cd apps/api && npm run test
```

Expected: all test files pass, total test count higher than the pre-existing 66.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/archive.ts apps/api/src/services/archive.test.ts apps/api/src/types.ts
git commit -m "Add getArchivedSignals read path to the signal archive service"
```

---

### Task 3: Register `GET /api/archive` in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `parsePageParam`, `parsePageSizeParam`, `parseArchiveFilters` (Task 1, `./logic/paginationParams`); `getArchivedSignals` (Task 2, `./services/archive`).
- Produces: the live `GET /api/archive` route, consumed by Task 4 (openapi.yaml documentation) and by any future frontend/backtesting work (out of scope here).

- [ ] **Step 1: Add the imports**

In `apps/api/src/server.ts`, add these two import lines alongside the existing imports near the top of the file (after the `import { computeArenaScoreboards, isTotalsSignal } from "./logic/arena";` line):

```typescript
import { parseArchiveFilters, parsePageParam, parsePageSizeParam } from "./logic/paginationParams";
import { getArchivedSignals } from "./services/archive";
```

- [ ] **Step 2: Add the route**

Add this route in `apps/api/src/server.ts` immediately after the existing `app.get("/api/arena", ...)` route block:

```typescript
app.get("/api/archive", async (req, res) => {
  const page = parsePageParam(req.query.page);
  const pageSize = parsePageSizeParam(req.query.pageSize);
  const filters = parseArchiveFilters(req.query as Record<string, unknown>);

  const result = await getArchivedSignals(filters, { page, pageSize });

  res.json(result);
});
```

- [ ] **Step 3: Verify the project still builds**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no type errors (confirms `req.query` cast and the new imports resolve correctly).

- [ ] **Step 4: Manual verification against a running server**

Start the dev server in one terminal (`cd apps/api && npm run dev`), then in another terminal:

```bash
curl "http://localhost:4000/api/archive"
curl "http://localhost:4000/api/archive?page=1&pageSize=5"
curl "http://localhost:4000/api/archive?status=correct"
curl "http://localhost:4000/api/archive?market=totals"
curl "http://localhost:4000/api/archive?page=abc&pageSize=-5"
```

Expected: every call returns HTTP 200 with a `{ data: [...], pagination: {...} }` body. If `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are not set in the local `.env.local`, expect `data: []` and `pagination.totalCount: 0` on every call (fail-open) rather than an error — this is the expected local-dev behavior per the spec, not a bug. The last call (`page=abc&pageSize=-5`) should not error; it should behave identically to no `page`/`pageSize` params at all (clamped to `page: 1, pageSize: 25`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Register GET /api/archive route"
```

---

### Task 4: Document `GET /api/archive` in `openapi.yaml`

**Files:**
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: the route from Task 3 (documents its actual behavior; no code dependency).
- Produces: nothing consumed by later tasks — this is the last content task before final verification.

- [ ] **Step 1: Find the insertion point**

Open `openapi.yaml` and find the `/api/arena:` path entry (add this new path immediately after it, keeping the file's existing path ordering convention of roughly matching `server.ts`'s route registration order).

- [ ] **Step 2: Add the path entry**

Insert this block after the `/api/arena:` entry, matching the existing indentation/style used by `/api/odds-history:`:

```yaml
  /api/archive:
    get:
      summary: Read the permanent signal archive
      description: >
        Paginated, filterable read endpoint over the insert-only signal_archive
        Supabase table. Returns raw event-log rows (a signal typically appears
        twice: once for "created", once for "settled") rather than a collapsed
        per-signal view. Fail-open: returns an empty page with totalCount 0
        instead of an error if Supabase is unconfigured or unreachable.
      parameters:
        - name: page
          in: query
          required: false
          schema:
            type: integer
            default: 1
          description: 1-indexed page number. Invalid or non-positive values clamp to 1.
        - name: pageSize
          in: query
          required: false
          schema:
            type: integer
            default: 25
            maximum: 100
          description: Rows per page. Invalid or non-positive values clamp to 25; values above 100 clamp to 100.
        - name: matchId
          in: query
          required: false
          schema:
            type: string
          description: Exact match against the archived signal's matchId.
        - name: status
          in: query
          required: false
          schema:
            type: string
            enum: [pending, correct, incorrect]
          description: Exact match against the archived signal's resultStatus.
        - name: market
          in: query
          required: false
          schema:
            type: string
            enum: ["1x2", totals]
          description: >
            Inferred from matchId (no dedicated column): totals matches
            matchIds containing "-totals-"; 1x2 excludes them.
        - name: event
          in: query
          required: false
          schema:
            type: string
            enum: [created, settled]
          description: Exact match against which lifecycle event this row records.
      responses:
        "200":
          description: A page of archived signal events, always 200 even if Supabase is unconfigured (fail-open).
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        signalId:
                          type: string
                        event:
                          type: string
                          enum: [created, settled]
                        matchId:
                          type: string
                        side:
                          type: string
                        signalType:
                          type: string
                        severity:
                          type: string
                        resultStatus:
                          type: string
                          enum: [pending, correct, incorrect]
                        momentumScore:
                          type: number
                        oddsChangePct:
                          type: number
                        archivedAt:
                          type: string
                          format: date-time
                        signalData:
                          type: object
                  pagination:
                    type: object
                    properties:
                      page:
                        type: integer
                      pageSize:
                        type: integer
                      totalCount:
                        type: integer
                      totalPages:
                        type: integer
```

- [ ] **Step 3: Validate**

```bash
npx @redocly/cli lint openapi.yaml
```

Expected: `Woohoo! Your API description is valid.` with only the same pre-existing cosmetic `operationId` warnings as before (no new errors).

- [ ] **Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "Document GET /api/archive in openapi.yaml"
```

---

### Task 5: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/api && npm run test
```

Expected: all test files pass. Note the exact new total test count (was 66 before this feature) for use in Step 3.

- [ ] **Step 2: Run the full build**

```bash
cd apps/api && npm run build
```

Expected: clean `tsc` build, no errors.

- [ ] **Step 3: Update the docs**

In each of `README.md`, `TECHNICAL_DOCS.md`, and `SUBMISSION_NOTES.md`:
- Add `GET /api/archive (paginated, filterable read over the permanent signal archive)` to the API Endpoints list, in the same position as the route sits in `server.ts` (after `/api/recent-results`, before `/api/market-maker`... i.e. wherever it was registered in Task 3).
- Update the automated-test-count line to the real number measured in Step 1.
- In `TECHNICAL_DOCS.md`'s "Insert-Only Signal Archive" section, remove or amend the "Write-only for now — no read endpoint or dashboard panel exists yet" sentence to reflect that a read endpoint now exists (a dashboard panel is still deferred).
- In `SUBMISSION_NOTES.md`'s "Insert-Only Signal Archive" section (added this session), make the same amendment.

In `PROJECT_STATE.md`:
- Update the "16 backend routes total" count to 17 and add `/api/archive` to the route list.
- In "What still needs doing", mark item 1 ("Run the signal_archive SQL... Then verify growth") as still relevant only for the SQL-already-run part, and update item 2 ("Signal archive exposure") to note the read endpoint is done — dashboard panel is the only remaining piece.
- Update the test file list/count to match Step 1's real number, including `logic/paginationParams.test.ts` in the file list.

- [ ] **Step 4: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document GET /api/archive across project docs"
```

- [ ] **Step 5: Request final whole-branch review**

Per this repo's established convention, request a final review of the entire branch's diff (all 5 tasks' commits together) before merging to `main` — do not merge without it.
