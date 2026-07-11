# P1-16 Stream Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only derived status label (`STREAMING`/`STALE`/`RECONNECTING`/`STOPPED`) to the two SSE stream monitors, surfaced only via `GET /api/metrics` — no change to the actual streaming/reconnect control flow, no touch to the polling agent loop, no UI indicator.

**Architecture:** A single pure function, `deriveStreamStatus`, computes a label from `LiveStreamState`'s existing fields plus one new `isEnabled` input — no new stored state anywhere. `server.ts`'s existing `/api/metrics` route calls it twice (once per stream) and adds the result to the existing response shape.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- No change to `sseStreamMonitor.ts`'s actual `connectOnce`/`start` control flow — `deriveStreamStatus` only reads state, never writes it.
- No change to the polling agent loop (`processAgentCycle`/`runGuardedAgentCycle`) — explicitly out of scope, confirmed with the user.
- No UI indicator — backend-only, `GET /api/metrics` only, `/health` untouched.
- Reuse `ODDS_STALE_THRESHOLD_MS` from `logic/feedHealth.ts` (5 minutes) — do not invent a new staleness threshold.
- Verify backend with `npm run test && npm run build` from `apps/api` after each task.

---

### Task 1: `deriveStreamStatus`

**Files:**
- Modify: `apps/api/src/services/sseStreamMonitor.ts`
- Modify: `apps/api/src/services/sseStreamMonitor.test.ts`

**Interfaces:**
- Produces: `StreamStatus = "STREAMING" | "STALE" | "RECONNECTING" | "STOPPED"` and `deriveStreamStatus(state: LiveStreamState, isEnabled: boolean, nowMs: number): StreamStatus`, consumed by Task 2's route.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/services/sseStreamMonitor.test.ts`, find:

```typescript
import { createSseStreamMonitor, parseSseData } from "./sseStreamMonitor";
```

Replace with:

```typescript
import { createSseStreamMonitor, deriveStreamStatus, parseSseData } from "./sseStreamMonitor";
import type { LiveStreamState } from "./sseStreamMonitor";
```

Find:

```typescript
describe("createSseStreamMonitor", () => {
```

Insert immediately before it:

```typescript
function makeState(overrides: Partial<LiveStreamState> = {}): LiveStreamState {
  return {
    connected: false,
    lastEventAt: null,
    totalEventsReceived: 0,
    totalReconnects: 0,
    lastError: null,
    ...overrides,
  };
}

const NOW = new Date("2026-07-11T12:00:00.000Z").getTime();

describe("deriveStreamStatus", () => {
  it("returns STOPPED when the feed is disabled, regardless of other state", () => {
    const state = makeState({ connected: true, lastEventAt: new Date(NOW).toISOString() });

    expect(deriveStreamStatus(state, false, NOW)).toBe("STOPPED");
  });

  it("returns RECONNECTING when enabled but not currently connected", () => {
    const state = makeState({ connected: false });

    expect(deriveStreamStatus(state, true, NOW)).toBe("RECONNECTING");
  });

  it("returns STALE when connected but no event has arrived yet", () => {
    const state = makeState({ connected: true, lastEventAt: null });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STALE");
  });

  it("returns STREAMING when connected with a recent event", () => {
    const recentEventAt = new Date(NOW - 60_000).toISOString(); // 1 minute ago
    const state = makeState({ connected: true, lastEventAt: recentEventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STREAMING");
  });

  it("returns STALE when the last event is exactly at the 5-minute threshold", () => {
    const eventAt = new Date(NOW - 5 * 60 * 1000).toISOString();
    const state = makeState({ connected: true, lastEventAt: eventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STREAMING");
  });

  it("returns STALE when the last event is just past the 5-minute threshold", () => {
    const eventAt = new Date(NOW - 5 * 60 * 1000 - 1).toISOString();
    const state = makeState({ connected: true, lastEventAt: eventAt });

    expect(deriveStreamStatus(state, true, NOW)).toBe("STALE");
  });
});

```

Note on the two threshold-boundary tests: `ODDS_STALE_THRESHOLD_MS` is exactly 5 minutes, and the implementation (Step 3) uses a strict `>` comparison, so a gap of *exactly* 5 minutes is still `STREAMING` (not yet past the threshold) and 5 minutes + 1ms is `STALE`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run from `apps/api`: `npx vitest run src/services/sseStreamMonitor.test.ts`
Expected: FAIL — `deriveStreamStatus` is not exported from `./sseStreamMonitor` yet, so the whole file fails to import.

- [ ] **Step 3: Implement `deriveStreamStatus`**

Find:

```typescript
import { config } from "../config";
import { getGuestJwt } from "./txlineClient";

export interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}
```

Replace with:

```typescript
import { config } from "../config";
import { getGuestJwt } from "./txlineClient";
import { ODDS_STALE_THRESHOLD_MS } from "../logic/feedHealth";

export interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}

export type StreamStatus = "STREAMING" | "STALE" | "RECONNECTING" | "STOPPED";

/**
 * Read-only derived label over LiveStreamState's existing fields - never
 * writes state, never changes connect/reconnect/backoff behavior. Scoped
 * to these two SSE monitors only, deliberately NOT extended to the
 * polling agent loop (no circuit breaker) or unified into a single
 * app-wide state machine - both confirmed as real regression risk to
 * signal generation this close to the tournament ending (see P1-16 spec).
 *
 * isEnabled must be passed in (mirrors the exact condition start() uses
 * to no-op) because state alone can't distinguish "feed disabled" from
 * "enabled but hasn't connected yet" - both look identical
 * (connected: false, totalReconnects: 0).
 *
 * RECONNECTING covers both an active backoff retry and the sub-second
 * window before the very first connection attempt resolves - the
 * underlying monitor has no separate "CONNECTING" state either, and this
 * window is too short to be worth a 5th label.
 *
 * STALE's threshold reuses ODDS_STALE_THRESHOLD_MS from feedHealth.ts
 * (5 minutes) rather than inventing a new one.
 */
export function deriveStreamStatus(
  state: LiveStreamState,
  isEnabled: boolean,
  nowMs: number
): StreamStatus {
  if (!isEnabled) return "STOPPED";
  if (!state.connected) return "RECONNECTING";
  if (!state.lastEventAt) return "STALE";

  const ageMs = nowMs - new Date(state.lastEventAt).getTime();
  return ageMs > ODDS_STALE_THRESHOLD_MS ? "STALE" : "STREAMING";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/services/sseStreamMonitor.test.ts`
Expected: PASS, all tests in the file green (including every pre-existing test, unaffected since `deriveStreamStatus` is purely additive).

- [ ] **Step 5: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass (247 existing + 6 new = 253), clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/sseStreamMonitor.ts apps/api/src/services/sseStreamMonitor.test.ts
git commit -m "Add deriveStreamStatus for SSE monitors (P1-16, scoped-down)"
```

---

### Task 2: Wire into `GET /api/metrics`

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: `deriveStreamStatus` from Task 1.

- [ ] **Step 1: Update the import**

In `apps/api/src/server.ts`, find:

```typescript
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { getLiveOddsStreamState, startLiveOddsStreamMonitor } from "./services/txlineOddsStream";
```

Replace with:

```typescript
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { getLiveOddsStreamState, startLiveOddsStreamMonitor } from "./services/txlineOddsStream";
import { deriveStreamStatus } from "./services/sseStreamMonitor";
```

Confirmed against the current file: these are lines 9-10 of `server.ts`, matched exactly.

- [ ] **Step 2: Add status to the `/api/metrics` route**

Find:

```typescript
app.get("/api/metrics", (_req, res) => {
  const lastRun = store.agentRuns[0];
  const liveStream = getLiveStreamState();
  const liveOddsStream = getLiveOddsStreamState();

  const staleForMs = (state: { lastEventAt: string | null }) =>
    state.lastEventAt ? Date.now() - new Date(state.lastEventAt).getTime() : null;

  res.json({
    data: {
      uptimeSeconds: Math.round(process.uptime()),
      lastAgentCycle: lastRun
        ? {
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
            decisionLatencyMs:
              new Date(lastRun.finishedAt).getTime() - new Date(lastRun.startedAt).getTime(),
          }
        : null,
      liveStream: {
        connected: liveStream.connected,
        staleForMs: staleForMs(liveStream),
        totalReconnects: liveStream.totalReconnects,
      },
      liveOddsStream: {
        connected: liveOddsStream.connected,
        staleForMs: staleForMs(liveOddsStream),
        totalReconnects: liveOddsStream.totalReconnects,
      },
      duplicatesDropped: store.duplicatesDropped,
    },
  });
});
```

Replace with:

```typescript
app.get("/api/metrics", (_req, res) => {
  const lastRun = store.agentRuns[0];
  const liveStream = getLiveStreamState();
  const liveOddsStream = getLiveOddsStreamState();
  const isFeedEnabled = !config.useSimulatedFeed && Boolean(config.txlineApiKey);
  const now = Date.now();

  const staleForMs = (state: { lastEventAt: string | null }) =>
    state.lastEventAt ? Date.now() - new Date(state.lastEventAt).getTime() : null;

  res.json({
    data: {
      uptimeSeconds: Math.round(process.uptime()),
      lastAgentCycle: lastRun
        ? {
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
            decisionLatencyMs:
              new Date(lastRun.finishedAt).getTime() - new Date(lastRun.startedAt).getTime(),
          }
        : null,
      liveStream: {
        connected: liveStream.connected,
        staleForMs: staleForMs(liveStream),
        totalReconnects: liveStream.totalReconnects,
        status: deriveStreamStatus(liveStream, isFeedEnabled, now),
      },
      liveOddsStream: {
        connected: liveOddsStream.connected,
        staleForMs: staleForMs(liveOddsStream),
        totalReconnects: liveOddsStream.totalReconnects,
        status: deriveStreamStatus(liveOddsStream, isFeedEnabled, now),
      },
      duplicatesDropped: store.duplicatesDropped,
    },
  });
});
```

- [ ] **Step 3: Verify build**

Run from `apps/api`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification against a running dev server**

Run `npm run dev:once` in `apps/api`, wait a few seconds for the stream monitors to connect, then from another terminal:

```bash
curl -s http://localhost:4000/api/metrics | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('liveStream.status:', d.data.liveStream.status); console.log('liveOddsStream.status:', d.data.liveOddsStream.status);"
```

Expected: both print `STREAMING` once connected with recent events (this project's dev environment has real TxLINE credentials, confirmed earlier this session), or `RECONNECTING` briefly right after startup before the first connection resolves. Stop the local API server after checking (exact PID, not pattern-kill).

- [ ] **Step 5: Add the `status` field to `openapi.yaml`**

Find the `/api/metrics` path entry (added in P1-15), and within both the `liveStream` and `liveOddsStream` property schemas, add:

```yaml
                          status: { type: string, enum: [STREAMING, STALE, RECONNECTING, STOPPED] }
```

as a new property alongside the existing `connected`/`staleForMs`/`totalReconnects` properties, and add `status` to each of their `required` arrays.

- [ ] **Step 6: Verify `/api/docs` still resolves**

With the dev server running again (`npm run dev:once`): `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/docs/`
Expected: `200`. Stop the local API server after checking.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/server.ts openapi.yaml
git commit -m "Surface stream status in GET /api/metrics (P1-16, scoped-down)"
```

---

### Task 3: PROJECT_STATE.md update

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Document P1-16 completion**

Add an entry to `PROJECT_STATE.md`'s session-handoff section covering: the scoping conversation and the user's explicit approval of the scoped-down version (4 states, SSE monitors only, no polling-loop circuit breaker, no unified state machine, no UI indicator), the implementation, test/build counts observed in Tasks 1-2, and next action (report diff, user reviews and verifies live, then explicitly approves before push and before the P1-4/P1-5/P1-8/P1-19 revisits).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md
git commit -m "Update PROJECT_STATE.md: P1-16 implemented, awaiting review"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Confirm `GET /api/metrics`'s `liveStream.status`/`liveOddsStream.status` work correctly against a locally running dev server.
- [ ] Confirm no change was made to `processAgentCycle`, `runGuardedAgentCycle`, or any frontend file — this item is backend-only, SSE-monitors-only, exactly as scoped.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to. Do not start the P1-4/P1-5/P1-8/P1-19 revisits without the user's explicit go-ahead.
