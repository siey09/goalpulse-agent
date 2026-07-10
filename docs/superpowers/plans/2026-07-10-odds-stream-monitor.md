# TxLINE Real-Time Odds Stream Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, independent SSE connectivity monitor for TxLINE's real-time odds stream (`/api/odds/stream`), surfaced via `/health` as `liveOddsStream`, without touching the existing scores stream's behavior, `agent.ts`'s polling loop, or `store.oddsSnapshots`.

**Architecture:** Extract the scores stream's connect/reconnect/backoff/SSE-parse logic out of `services/txlineStream.ts` into a new shared factory, `services/sseStreamMonitor.ts` (`createSseStreamMonitor(endpointPath)`), so both the scores and odds monitors run through the same tested code path instead of two independently-maintained copies. `txlineStream.ts` becomes a 3-line wrapper preserving its current exported names; a new `txlineOddsStream.ts` is the odds-side equivalent.

**Tech Stack:** TypeScript, Node's native `fetch`, Vitest.

## Global Constraints

- Purely observational — never inspect or store the parsed odds payload's contents, only confirm valid-JSON frames arrived (matches spec's "Explicitly out of scope").
- `server.ts`'s existing `getLiveStreamState`/`startLiveStreamMonitor` imports and the `/health` route's `liveStream` field must be byte-for-byte unchanged in external behavior after the refactor.
- No change to `agent.ts`, `store.ts`, or any odds-chart/signal-generation code.
- Every new/moved function keeps its existing runtime behavior exactly (this is a refactor + additive feature, not a rewrite).

---

## Task 1: Create `services/sseStreamMonitor.ts` with tests

**Files:**
- Create: `apps/api/src/services/sseStreamMonitor.ts`
- Create: `apps/api/src/services/sseStreamMonitor.test.ts`

**Interfaces:**
- Produces: `export interface LiveStreamState { connected: boolean; lastEventAt: string | null; totalEventsReceived: number; totalReconnects: number; lastError: string | null; }`
- Produces: `export function parseSseData(chunk: string): string | null`
- Produces: `export function createSseStreamMonitor(endpointPath: string): { getState: () => LiveStreamState; connectOnce: () => Promise<void>; start: () => void; }`
- Consumes: `config` from `../config` (`useSimulatedFeed`, `txlineApiKey`, `txlineApiBaseUrl`), `getGuestJwt` from `./txlineClient`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/sseStreamMonitor.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";

vi.mock("./txlineClient", () => ({
  getGuestJwt: vi.fn().mockResolvedValue("fake-jwt"),
}));

import { createSseStreamMonitor, parseSseData } from "./sseStreamMonitor";

function makeFetchResponse(chunks: string[], options: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  const reader = {
    read: vi.fn().mockImplementation(async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }
      const value = encoder.encode(chunks[index]);
      index += 1;
      return { done: false, value };
    }),
  };

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: "OK",
    body: options.ok === false ? null : { getReader: () => reader },
  };
}

beforeEach(() => {
  config.useSimulatedFeed = false;
  config.txlineApiKey = "test-key";
  config.txlineApiBaseUrl = "https://example.test";
  vi.restoreAllMocks();
});

describe("parseSseData", () => {
  it("extracts a single data: line", () => {
    expect(parseSseData('data: {"a":1}')).toBe('{"a":1}');
  });

  it("joins multi-line data: fields", () => {
    expect(parseSseData("data: line1\ndata: line2")).toBe("line1\nline2");
  });

  it("returns null when there is no data: line", () => {
    expect(parseSseData(": keepalive")).toBeNull();
  });
});

describe("createSseStreamMonitor", () => {
  it("increments totalEventsReceived and sets lastEventAt on a valid JSON frame", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse(['data: {"foo":1}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitor.connectOnce();

    const state = monitor.getState();
    expect(state.totalEventsReceived).toBe(1);
    expect(state.lastEventAt).not.toBeNull();
  });

  it("ignores a non-JSON keepalive frame without incrementing the counter", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse([": keepalive\n\n"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitor.connectOnce();

    expect(monitor.getState().totalEventsReceived).toBe(0);
  });

  it("throws and leaves connected false when the response is not ok", async () => {
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse([], { ok: false, status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(monitor.connectOnce()).rejects.toThrow();
    expect(monitor.getState().connected).toBe(false);
  });

  it("keeps two independently-created monitors' state fully isolated", async () => {
    const monitorA = createSseStreamMonitor("/api/scores/stream");
    const monitorB = createSseStreamMonitor("/api/odds/stream");
    const response = makeFetchResponse(['data: {"foo":1}\n\n']);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await monitorA.connectOnce();

    expect(monitorA.getState().totalEventsReceived).toBe(1);
    expect(monitorB.getState().totalEventsReceived).toBe(0);
  });

  it("start() does not call fetch when useSimulatedFeed is true", () => {
    config.useSimulatedFeed = true;
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    monitor.start();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("start() does not call fetch when txlineApiKey is empty", () => {
    config.txlineApiKey = "";
    const monitor = createSseStreamMonitor("/api/odds/stream");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    monitor.start();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/services/sseStreamMonitor.test.ts` (from `apps/api`)
Expected: FAIL — `Cannot find module './sseStreamMonitor'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/services/sseStreamMonitor.ts`:

```ts
import { config } from "../config";
import { getGuestJwt } from "./txlineClient";

export interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}

export function parseSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

/**
 * Creates an independent SSE connectivity monitor for a TxLINE stream
 * endpoint (e.g. "/api/scores/stream", "/api/odds/stream"). Each call
 * returns its own private state -- multiple monitors never share or
 * collide on connection state. Purely observational: proves *that* JSON
 * frames arrive (connected status, last-event age, running event count),
 * never inspects or trusts the parsed payload's contents.
 */
export function createSseStreamMonitor(endpointPath: string): {
  getState: () => LiveStreamState;
  connectOnce: () => Promise<void>;
  start: () => void;
} {
  const state: LiveStreamState = {
    connected: false,
    lastEventAt: null,
    totalEventsReceived: 0,
    totalReconnects: 0,
    lastError: null,
  };

  async function connectOnce(): Promise<void> {
    const jwt = await getGuestJwt();

    const response = await fetch(`${config.txlineApiBaseUrl}${endpointPath}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": config.txlineApiKey,
        Accept: "text/event-stream",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `TxLINE stream connection failed: ${response.status} ${response.statusText}`
      );
    }

    state.connected = true;
    state.lastError = null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const data = parseSseData(chunk);

          if (data === null) {
            continue;
          }

          try {
            JSON.parse(data);
            state.totalEventsReceived += 1;
            state.lastEventAt = new Date().toISOString();
          } catch {
            // Non-JSON keepalive/comment frame; ignore safely.
          }
        }
      }
    } finally {
      state.connected = false;
    }
  }

  function start(): void {
    if (config.useSimulatedFeed || !config.txlineApiKey) {
      return;
    }

    let backoffMs = 2000;
    const maxBackoffMs = 60000;

    const loop = async () => {
      try {
        await connectOnce();
        backoffMs = 2000;
      } catch (error) {
        state.connected = false;
        state.lastError = error instanceof Error ? error.message : String(error);
        state.totalReconnects += 1;
      }

      setTimeout(loop, backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    };

    loop();
  }

  return {
    getState: () => ({ ...state }),
    connectOnce,
    start,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/services/sseStreamMonitor.test.ts` (from `apps/api`)
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sseStreamMonitor.ts apps/api/src/services/sseStreamMonitor.test.ts
git commit -m "Add shared SSE stream monitor factory with tests"
```

---

## Task 2: Convert `txlineStream.ts` into a thin wrapper

**Files:**
- Modify: `apps/api/src/services/txlineStream.ts` (full rewrite of its ~134 lines down to a wrapper)

**Interfaces:**
- Consumes: `createSseStreamMonitor` from `./sseStreamMonitor` (Task 1).
- Produces (unchanged names/types, for `server.ts`): `export const getLiveStreamState: () => LiveStreamState`, `export const startLiveStreamMonitor: () => void`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `apps/api/src/services/txlineStream.ts` with:

```ts
import { createSseStreamMonitor } from "./sseStreamMonitor";

/**
 * Live connectivity state for TxLINE's native Server-Sent Events stream
 * (/api/scores/stream). This is additive to, and independent from, the
 * existing 5-second polling loop in agent.ts. The polling loop remains the
 * source of truth for signal generation (it is tested and verified live).
 *
 * This monitor proves genuine push-based, real-time connectivity to TxLINE's
 * own streaming infrastructure (rather than just periodic REST polling) and
 * surfaces it honestly via /health as connectivity/observability data:
 * connected status, last-event age, and a running event count. It does not
 * feed directly into signal generation, since the exact per-message JSON
 * shape of the live stream has not been verified against production traffic.
 */
const monitor = createSseStreamMonitor("/api/scores/stream");

export const getLiveStreamState = monitor.getState;

/**
 * Starts the live stream monitor with automatic reconnection and capped
 * backoff. Safe to call once at server startup. Never throws; all errors are
 * captured into state.lastError so a connectivity issue cannot crash the
 * main API process.
 */
export const startLiveStreamMonitor = monitor.start;
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npm test` (from `apps/api`)
Expected: PASS — same total test count as before Task 1 plus the 8 new tests from Task 1 (no test file references `txlineStream.ts` directly today, so this is a behavior-preservation check via the rest of the suite staying green, plus a manual read-through confirming `getLiveStreamState`/`startLiveStreamMonitor` still have identical signatures).

- [ ] **Step 3: Run the typecheck**

Run: `npx tsc --noEmit` (from `apps/api`)
Expected: no errors — confirms `server.ts`'s existing `import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream"` still resolves with matching types.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/txlineStream.ts
git commit -m "Convert txlineStream.ts scores monitor to use shared sseStreamMonitor"
```

---

## Task 3: Create `txlineOddsStream.ts`

**Files:**
- Create: `apps/api/src/services/txlineOddsStream.ts`

**Interfaces:**
- Consumes: `createSseStreamMonitor` from `./sseStreamMonitor` (Task 1).
- Produces: `export const getLiveOddsStreamState: () => LiveStreamState`, `export const startLiveOddsStreamMonitor: () => void`.

- [ ] **Step 1: Write the file**

Create `apps/api/src/services/txlineOddsStream.ts`:

```ts
import { createSseStreamMonitor } from "./sseStreamMonitor";

/**
 * Live connectivity state for TxLINE's native Server-Sent Events stream
 * (/api/odds/stream). This is additive to, and independent from, both the
 * existing scores-stream monitor (txlineStream.ts) and the 5-second odds
 * polling loop in agent.ts, which remains the sole source of odds data
 * fed into signal generation and the odds chart.
 *
 * This monitor proves genuine push-based, real-time connectivity to
 * TxLINE's real-time odds feed and surfaces it honestly via /health as
 * connectivity/observability data: connected status, last-event age, and a
 * running event count. It does not feed into store.oddsSnapshots or signal
 * generation, since the exact per-message JSON shape of this live stream
 * has not been verified against production traffic.
 */
const monitor = createSseStreamMonitor("/api/odds/stream");

export const getLiveOddsStreamState = monitor.getState;

/**
 * Starts the live odds stream monitor with automatic reconnection and
 * capped backoff. Safe to call once at server startup. Never throws; all
 * errors are captured into state.lastError so a connectivity issue cannot
 * crash the main API process.
 */
export const startLiveOddsStreamMonitor = monitor.start;
```

- [ ] **Step 2: Run the typecheck**

Run: `npx tsc --noEmit` (from `apps/api`)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/txlineOddsStream.ts
git commit -m "Add txlineOddsStream.ts: real-time odds stream connectivity monitor"
```

---

## Task 4: Wire the odds monitor into `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts:9` (import line)
- Modify: `apps/api/src/server.ts:59-70` (`/health` route)
- Modify: `apps/api/src/server.ts:1118` (startup block, alongside `startLiveStreamMonitor()`)

**Interfaces:**
- Consumes: `getLiveOddsStreamState`, `startLiveOddsStreamMonitor` from `./services/txlineOddsStream` (Task 3).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, change line 9 from:

```ts
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
```

to:

```ts
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { getLiveOddsStreamState, startLiveOddsStreamMonitor } from "./services/txlineOddsStream";
```

- [ ] **Step 2: Add the `/health` field**

Change the `/health` route (currently lines 59-70) from:

```ts
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    liveStream: getLiveStreamState(),
    timestamp: new Date().toISOString(),
  });
});
```

to:

```ts
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GoalPulse Agent API",
    status: "running",
    agentIntervalMs: config.agentIntervalMs,
    useSimulatedFeed: config.useSimulatedFeed,
    txlineBaseUrl: config.txlineApiBaseUrl,
    liveStream: getLiveStreamState(),
    liveOddsStream: getLiveOddsStreamState(),
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 3: Start the odds monitor alongside the scores monitor**

Find the startup block (currently around line 1118-1120):

```ts
app.listen(config.port, async () => {
  console.log(`GoalPulse Agent API running on http://localhost:${config.port}`);
  console.log(`Autonomous agent interval: ${config.agentIntervalMs}ms`);
  console.log(
    `Feed mode: ${config.useSimulatedFeed ? "simulated_txline" : "txline"}`
  );

  await loadSnapshot();

  await runGuardedAgentCycle("startup");
```

Locate the line that currently calls `startLiveStreamMonitor();` and change it from:

```ts
  startLiveStreamMonitor();
```

to:

```ts
  startLiveStreamMonitor();
  startLiveOddsStreamMonitor();
```

- [ ] **Step 4: Run the typecheck and full test suite**

Run: `npx tsc --noEmit && npm test` (from `apps/api`)
Expected: both clean — no type errors, full suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Wire real-time odds stream monitor into server startup and /health"
```

---

## Task 5: Update `openapi.yaml`

**Files:**
- Modify: `openapi.yaml:537-543` (`/health` response schema)

**Interfaces:**
- Consumes: existing `#/components/schemas/LiveStreamState` schema component (already defined, used by the current `liveStream` field).

- [ ] **Step 1: Add the `liveOddsStream` field to the schema**

In `openapi.yaml`, change the `/health` response properties block from:

```yaml
                  agentIntervalMs: { type: number }
                  useSimulatedFeed: { type: boolean }
                  txlineBaseUrl: { type: string }
                  liveStream:
                    $ref: '#/components/schemas/LiveStreamState'
                  timestamp: { type: string, format: date-time }
                required: [ok, service, status, agentIntervalMs, useSimulatedFeed, txlineBaseUrl, liveStream, timestamp]
```

to:

```yaml
                  agentIntervalMs: { type: number }
                  useSimulatedFeed: { type: boolean }
                  txlineBaseUrl: { type: string }
                  liveStream:
                    $ref: '#/components/schemas/LiveStreamState'
                  liveOddsStream:
                    $ref: '#/components/schemas/LiveStreamState'
                  timestamp: { type: string, format: date-time }
                required: [ok, service, status, agentIntervalMs, useSimulatedFeed, txlineBaseUrl, liveStream, liveOddsStream, timestamp]
```

- [ ] **Step 2: Verify the YAML is still valid**

Run: `node -e "console.log(Object.keys(require('yamljs').load('openapi.yaml').paths['/health'])); "` (from `apps/api`, since `yamljs` is a dependency there)
Expected: prints without throwing (confirms the file still parses).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "Document liveOddsStream in the /health OpenAPI schema"
```

---

## Task 6: Local verification against the real TxLINE feed

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the dev server against the real feed**

`.env.local` in `apps/api` already has `USE_SIMULATED_FEED=false`. Run:

```bash
npx tsx src/server.ts
```

- [ ] **Step 2: Check `/health` for both stream fields**

In a separate terminal, after a few seconds:

```bash
curl -s http://localhost:4000/health
```

Expected: JSON response contains both `liveStream` and `liveOddsStream` objects, each shaped like `{connected, lastEventAt, totalEventsReceived, totalReconnects, lastError}`. Both should reach `connected: true` within a few seconds; `totalEventsReceived` on at least `liveStream` (scores) should be non-zero shortly after (matches prior session's observed behavior). `liveOddsStream.totalEventsReceived` may stay at 0 if there's no live match odds activity at the moment (acceptable — the odds stream monitor is honest about connectivity regardless of event volume, same as the scores stream already is).

- [ ] **Step 3: Stop the dev server**

Confirm the process is stopped cleanly (matches the project's Windows dev-server precedent: kill by exact PID, not a pattern match).

- [ ] **Step 4: Report back**

Report the `/health` output from Step 2 back before proceeding to push — this is the checkpoint before the user reviews the diff and merges.

---

## Notes for whoever picks this up

- **Do not add any parsing/inspection of the odds stream's payload contents.** The spec (`docs/superpowers/specs/2026-07-10-odds-stream-monitor-design.md`) and its referenced prior assessment (`docs/superpowers/specs/2026-07-09-txlinestream-extension-assessment.md`) both establish this boundary deliberately — wiring live-stream events into `store`/signal generation is explicitly a no-go before July 19 given the concurrency risk against `agent.ts`'s single-threaded pipeline.
- After merge, live production verification (per the user's explicit process) checks `GET /health` on the deployed backend for the new `liveOddsStream` field, and confirms the existing `liveStream` (scores) field's behavior is unchanged from before this change — not just present, but reconnecting/counting the same way it did pre-refactor.
