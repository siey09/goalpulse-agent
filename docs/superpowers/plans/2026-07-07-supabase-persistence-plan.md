# Supabase Periodic-Snapshot Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the entire in-memory `store` object to Supabase every 30 seconds, and recover it on server startup, so data survives a Render restart — with fail-open behavior if Supabase is unreachable or unconfigured.

**Architecture:** A new `apps/api/src/services/persistence.ts` service using `@supabase/supabase-js`, upserting/reading a single JSONB row, wired into the existing agent-cycle scheduler in `server.ts` (no separate timer, no ORM, no relational schema).

**Tech Stack:** `@supabase/supabase-js`, Vitest (mocked client), matching this project's existing strict-TypeScript convention.

## Global Constraints

- Both `saveSnapshot()` and `loadSnapshot()` must no-op immediately if `config.supabaseUrl`/`config.supabaseServiceKey` are empty — never throw, never block (spec: "New file", "Confirmed constraints").
- The full store object (all 5 fields: `matches`, `recentFinishedMatches`, `oddsSnapshots`, `signals`, `agentRuns`) gets persisted as one JSONB blob in a single-row table — not a relational schema (spec: "What gets persisted", "Alternatives considered").
- Write cadence is 30 real wall-clock seconds, not a cycle-count threshold, because `AGENT_INTERVAL_MS` differs between local dev (2000ms) and production (5000ms) (spec: "Write path").
- `loadSnapshot()` must have an internal timeout so a slow/unreachable Supabase can never hang server startup (spec: "Read path").
- No automated test against a live Supabase instance — none exists yet. Use a mocked client instead (spec: "Testing").
- No new Supabase project can be created by the implementer — that is the user's own follow-up step after this plan is executed (spec: "Confirmed constraints").

---

### Task 1: Dependency, config, schema file

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/.env.example`
- Create: `apps/api/supabase-schema.sql`

**Interfaces:**
- Produces: `config.supabaseUrl: string`, `config.supabaseServiceKey: string`. Task 2 reads both.

- [ ] **Step 1: Add the dependency**

In `apps/api/package.json`, the current `dependencies` block is:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "express-rate-limit": "latest",
    "swagger-ui-express": "latest",
    "tweetnacl": "^1.0.3",
    "yamljs": "latest",
    "zod": "latest"
  },
```

Replace with:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "@supabase/supabase-js": "latest",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "express-rate-limit": "latest",
    "swagger-ui-express": "latest",
    "tweetnacl": "^1.0.3",
    "yamljs": "latest",
    "zod": "latest"
  },
```

- [ ] **Step 2: Install it**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd install`
Expected: completes successfully, `node_modules/@supabase/supabase-js` now exists, `package-lock.json` updated.

- [ ] **Step 3: Add config fields**

In `apps/api/src/config.ts`, the current file is:

```ts
import dotenv from "dotenv";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 3000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl:
    process.env.TXLINE_BASE_URL ??
    process.env.TXLINE_API_BASE_URL ??
    "https://txline.txodds.com",
  txlineApiKey:
    process.env.TXLINE_API_TOKEN ??
    process.env.TXLINE_API_KEY ??
    "",
  apiAccessKey: process.env.API_ACCESS_KEY ?? "",
};
```

Replace the `export const config = {...}` block with:

```ts
export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 3000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl:
    process.env.TXLINE_BASE_URL ??
    process.env.TXLINE_API_BASE_URL ??
    "https://txline.txodds.com",
  txlineApiKey:
    process.env.TXLINE_API_TOKEN ??
    process.env.TXLINE_API_KEY ??
    "",
  apiAccessKey: process.env.API_ACCESS_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
};
```

- [ ] **Step 4: Document the env vars**

In `apps/api/.env.example`, the current file is:

```
PORT=4000
AGENT_INTERVAL_MS=5000
TXLINE_API_BASE_URL=
TXLINE_API_KEY=
USE_SIMULATED_FEED=true
# Protects POST /api/agent/run-once. Send it back as the X-API-Key header.
API_ACCESS_KEY=
```

Append:

```
PORT=4000
AGENT_INTERVAL_MS=5000
TXLINE_API_BASE_URL=
TXLINE_API_KEY=
USE_SIMULATED_FEED=true
# Protects POST /api/agent/run-once. Send it back as the X-API-Key header.
API_ACCESS_KEY=
# Optional: periodic store snapshotting to Supabase (survives Render restarts).
# If either is unset, the server runs in-memory only, exactly as before -
# never blocks startup or crashes when Supabase is unreachable/unconfigured.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

- [ ] **Step 5: Create the SQL schema file**

Create `apps/api/supabase-schema.sql`:

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

- [ ] **Step 6: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output (clean `tsc` run).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/config.ts apps/api/.env.example apps/api/supabase-schema.sql
git commit -m "Add Supabase dependency, config, and schema file for persistence"
```

---

### Task 2: Create the persistence service with tests

**Files:**
- Create: `apps/api/src/services/persistence.ts`
- Create: `apps/api/src/services/persistence.test.ts`

**Interfaces:**
- Consumes: `config.supabaseUrl`, `config.supabaseServiceKey` (Task 1); `store` from `../store`.
- Produces: `export async function saveSnapshot(): Promise<void>`, `export async function loadSnapshot(): Promise<void>`. Task 3 imports both into `server.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/persistence.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: upsertMock,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
    })),
  })),
}));

import { config } from "../config";
import { store } from "../store";
import { loadSnapshot, saveSnapshot } from "./persistence";

describe("persistence", () => {
  beforeEach(() => {
    config.supabaseUrl = "";
    config.supabaseServiceKey = "";
    upsertMock.mockReset();
    maybeSingleMock.mockReset();
    store.matches = [];
    store.recentFinishedMatches = [];
    store.oddsSnapshots = [];
    store.signals = [];
    store.agentRuns = [];
  });

  it("saveSnapshot no-ops when Supabase is not configured", async () => {
    await saveSnapshot();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("loadSnapshot no-ops when Supabase is not configured", async () => {
    await loadSnapshot();

    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("loadSnapshot populates store from a successful mocked load", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockResolvedValue({
      data: {
        data: {
          matches: [{ id: "match-1" }],
          recentFinishedMatches: [],
          oddsSnapshots: [],
          signals: [],
          agentRuns: [],
        },
      },
      error: null,
    });

    await loadSnapshot();

    expect(store.matches).toEqual([{ id: "match-1" }]);
  });

  it("loadSnapshot does not throw when the mocked call rejects", async () => {
    config.supabaseUrl = "https://example.supabase.co";
    config.supabaseServiceKey = "test-key";

    maybeSingleMock.mockRejectedValue(new Error("network error"));

    await expect(loadSnapshot()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: FAIL — `persistence.test.ts` cannot resolve `./persistence` (module does not exist yet). The other 20 existing tests still pass.

- [ ] **Step 3: Write the persistence service**

Create `apps/api/src/services/persistence.ts`:

```ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { store } from "../store";
import type { AgentRun, AgentSignal, Match, OddsSnapshot } from "../types";

const SNAPSHOT_TABLE = "store_snapshots";
const SNAPSHOT_ROW_ID = 1;
const LOAD_TIMEOUT_MS = 5000;

type StoreSnapshot = {
  matches: Match[];
  recentFinishedMatches: Match[];
  oddsSnapshots: OddsSnapshot[];
  signals: AgentSignal[];
  agentRuns: AgentRun[];
};

function getClient(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseServiceKey);
}

/**
 * Upserts the entire in-memory store as one JSONB blob. Fail-open: no-ops if
 * Supabase is not configured, and a delivery failure is logged but never
 * thrown - a Supabase outage must never break the agent cycle that calls
 * this.
 */
export async function saveSnapshot(): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    const snapshot: StoreSnapshot = {
      matches: store.matches,
      recentFinishedMatches: store.recentFinishedMatches,
      oddsSnapshots: store.oddsSnapshots,
      signals: store.signals,
      agentRuns: store.agentRuns,
    };

    await client.from(SNAPSHOT_TABLE).upsert({
      id: SNAPSHOT_ROW_ID,
      data: snapshot,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[persistence] Failed to save snapshot to Supabase:", error);
  }
}

/**
 * Loads the most recent snapshot and assigns its fields onto the existing
 * store object in place (other modules import `store` directly, so the
 * object reference must not be replaced). Fail-open: no-ops if Supabase is
 * not configured, bounded by an internal timeout so a slow/unreachable
 * Supabase can never hang server startup, and never throws.
 */
export async function loadSnapshot(): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    const queryPromise = client
      .from(SNAPSHOT_TABLE)
      .select("data")
      .eq("id", SNAPSHOT_ROW_ID)
      .maybeSingle();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Supabase load timed out")),
        LOAD_TIMEOUT_MS
      );
    });

    const { data: row, error } = await Promise.race([
      queryPromise,
      timeoutPromise,
    ]);

    if (error || !row?.data) {
      return;
    }

    const snapshot = row.data as StoreSnapshot;

    store.matches = snapshot.matches ?? [];
    store.recentFinishedMatches = snapshot.recentFinishedMatches ?? [];
    store.oddsSnapshots = snapshot.oddsSnapshots ?? [];
    store.signals = snapshot.signals ?? [];
    store.agentRuns = snapshot.agentRuns ?? [];

    console.log(
      `[persistence] Restored store from Supabase snapshot (${store.matches.length} matches, ${store.signals.length} signals, ${store.oddsSnapshots.length} odds snapshots, ${store.agentRuns.length} agent runs).`
    );
  } catch (error) {
    console.error("[persistence] Failed to load snapshot from Supabase:", error);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 24 tests (20 existing + 4 new) pass.

- [ ] **Step 5: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/persistence.ts apps/api/src/services/persistence.test.ts
git commit -m "Add Supabase persistence service with mocked-client tests"
```

---

### Task 3: Wire startup recovery and periodic snapshotting into server.ts

**Files:**
- Modify: `apps/api/src/server.ts:1-16` (imports)
- Modify: `apps/api/src/server.ts` (`runGuardedAgentCycle` and the `app.listen(...)` callback)

**Interfaces:**
- Consumes: `saveSnapshot`, `loadSnapshot` from `./services/persistence` (Task 2).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, the current imports are:

```ts
import { createHash } from "crypto";
import path from "path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

Add one import line after the `onchainValidation` import:

```ts
import { createHash } from "crypto";
import path from "path";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { loadSnapshot, saveSnapshot } from "./services/persistence";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

- [ ] **Step 2: Add periodic snapshotting to the agent cycle scheduler**

Find the current scheduler and startup block:

```ts
let isAgentCycleRunning = false;

async function runGuardedAgentCycle(source: string) {
  if (isAgentCycleRunning) {
    console.warn(`Skipping ${source} agent cycle because the previous cycle is still running.`);
    return;
  }

  isAgentCycleRunning = true;

  try {
    const run = await processAgentCycle();
    console.log(run.message);
  } catch (error) {
    console.error("Agent cycle failed:", error);
  } finally {
    isAgentCycleRunning = false;
  }
}
app.listen(config.port, async () => {
  console.log(`GoalPulse Agent API running on http://localhost:${config.port}`);
  console.log(`Autonomous agent interval: ${config.agentIntervalMs}ms`);
  console.log(
    `Feed mode: ${config.useSimulatedFeed ? "simulated_txline" : "txline"}`
  );
  await runGuardedAgentCycle("startup");

  startLiveStreamMonitor();

  setInterval(() => {
    void runGuardedAgentCycle("scheduled");
  }, config.agentIntervalMs);
});
```

Replace with:

```ts
let isAgentCycleRunning = false;
let lastSnapshotAt = 0;
const snapshotIntervalMs = 30000;

async function runGuardedAgentCycle(source: string) {
  if (isAgentCycleRunning) {
    console.warn(`Skipping ${source} agent cycle because the previous cycle is still running.`);
    return;
  }

  isAgentCycleRunning = true;

  try {
    const run = await processAgentCycle();
    console.log(run.message);

    if (Date.now() - lastSnapshotAt >= snapshotIntervalMs) {
      lastSnapshotAt = Date.now();
      void saveSnapshot();
    }
  } catch (error) {
    console.error("Agent cycle failed:", error);
  } finally {
    isAgentCycleRunning = false;
  }
}
app.listen(config.port, async () => {
  console.log(`GoalPulse Agent API running on http://localhost:${config.port}`);
  console.log(`Autonomous agent interval: ${config.agentIntervalMs}ms`);
  console.log(
    `Feed mode: ${config.useSimulatedFeed ? "simulated_txline" : "txline"}`
  );

  await loadSnapshot();

  await runGuardedAgentCycle("startup");

  startLiveStreamMonitor();

  setInterval(() => {
    void runGuardedAgentCycle("scheduled");
  }, config.agentIntervalMs);
});
```

- [ ] **Step 3: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 4: Verify the full test suite passes**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 24 tests pass.

- [ ] **Step 5: Manually verify the fail-open path (no Supabase project exists yet)**

Confirm `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are NOT set in `apps/api/.env.local` (they should be absent — no Supabase project exists yet per the spec's "Confirmed constraints").

Check an unused port first (this session's established lesson: always verify before starting, kill by exact PID afterward, never by `pkill` pattern):

Run: `netstat -ano | grep ":4003" | grep LISTENING || echo "port 4003 free"`

Start the dev server:

Run: `cd C:\Projects\goalpulse-agent\apps\api && PORT=4003 npm.cmd run dev`

Confirm in the log output:
- No errors, no hangs — the server logs `GoalPulse Agent API running on http://localhost:4003` and proceeds through the startup agent cycle normally, exactly as before this change.
- No `[persistence]` log lines appear (since `saveSnapshot`/`loadSnapshot` no-op silently when unconfigured — no output at all is the correct, expected behavior here).

Then confirm existing behavior still works:

Run: `curl -s http://127.0.0.1:4003/api/matches -o /dev/null -w "GET /api/matches: %{http_code}\n"`
Expected: `200`.

Find the PID and stop the server:

Run: `netstat -ano | grep ":4003" | grep LISTENING`
Run: `powershell -Command "Stop-Process -Id <pid> -Force"` (substitute the actual PID from the previous command)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Wire Supabase snapshot recovery and periodic save into server.ts"
```

---

## Self-Review

**Spec coverage:**
- Single-row JSONB schema, upserted (spec: "Schema") → Task 1, Step 5.
- Full 5-field store object persisted (spec: "What gets persisted") → Task 2, `StoreSnapshot` type and `saveSnapshot`'s payload.
- `persistence.ts` fail-open on both functions, no-op when unconfigured (spec: "New file") → Task 2.
- `loadSnapshot` timeout, `saveSnapshot`/`loadSnapshot` never throw (spec: "New file") → Task 2, `Promise.race` + try/catch in both functions.
- Config fields matching existing `?? ""` pattern (spec: "Config") → Task 1, Step 3.
- 30-second wall-clock write cadence tied into the existing scheduler, not a separate timer (spec: "Write path") → Task 3, Step 2.
- Startup recovery before the first agent cycle (spec: "Read path") → Task 3, Step 2 (`await loadSnapshot()` before `await runGuardedAgentCycle("startup")`).
- Mocked-client tests, no live Supabase test (spec: "Testing") → Task 2.
- User's own follow-up (create project, run SQL, configure Render) — see closing notes below, not a plan task, per spec's "Confirmed constraints" and "Follow-ups".

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, copied from either the actual current file contents (verified by reading them during planning) or fully written new content.

**Type consistency:** `StoreSnapshot` (Task 2) exactly matches the 5 fields of the `store` object as typed in `apps/api/src/store.ts` (`Match[]`, `Match[]`, `OddsSnapshot[]`, `AgentSignal[]`, `AgentRun[]`). `saveSnapshot`/`loadSnapshot` (Task 2) are imported and used identically in Task 3 — no wrapper, no signature drift.

## Closing notes for the user (not a plan task — cannot be automated)

After this plan is executed and merged:

1. Create a free Supabase project at supabase.com (no credit card required).
2. In the Supabase dashboard's SQL editor, run the contents of `apps/api/supabase-schema.sql`.
3. From the project's API settings, copy the project URL and the `service_role` key (not the public `anon` key — writes need elevated privileges to bypass row-level security on this internal table).
4. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to Render's environment variables for the `goalpulse-agent-api` service.
5. After Render redeploys, verify: restart the Render service manually once (or wait for a natural redeploy) and confirm `/api/stats`/`/api/matches` still show prior data instead of resetting to empty — this is the actual proof the whole feature works, and only you can perform it against the real Render environment.
