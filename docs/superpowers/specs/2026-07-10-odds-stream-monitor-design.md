# TxLINE Real-Time Odds Stream Monitor — Design Spec

**Date:** 2026-07-10
**Status:** Approved, pending implementation plan.
**Related:** `docs/superpowers/specs/2026-07-09-txlinestream-extension-assessment.md`
concluded that wiring `txlineStream.ts`'s live scores-stream events into
actual signal generation is a no-go before July 19 (concurrency risk
against `agent.ts`'s single-threaded pipeline, unverified payload schema).
This spec stays deliberately on the safe side of that boundary: it adds a
second, independent connectivity monitor for TxLINE's odds stream, with the
exact same purely-observational scope the scores stream already has today
— no write to `store`, no coupling to signal generation, no change to the
proven 5s polling path in `agent.ts`.

## Problem

`agent.ts`'s 5-second polling cycle (`/api/odds/snapshot`, `/api/odds/updates`)
is the sole source of odds data today. TxLINE also offers a genuine
real-time SSE odds stream (`https://txline.txodds.com/api/odds/stream`,
confirmed against `https://txline.txodds.com/documentation/examples/streaming-data`)
that this codebase has never connected to. We already have proof this
pattern works safely and cheaply: `txlineStream.ts` has run an equivalent
connection to the scores stream (`/api/scores/stream`) all session,
surfaced via `/health`, with zero incidents.

## Goal

A second SSE connectivity monitor, for `/api/odds/stream`, additive to and
independent from both the existing scores-stream monitor and the polling
loop in `agent.ts`. Proves genuine real-time odds-stream connectivity as a
second `/health` data point. Does not feed the odds chart, does not touch
`store.oddsSnapshots`, does not generate signals.

## Architecture

Extract the scores stream's connect/reconnect/backoff/SSE-parse logic —
currently private to `txlineStream.ts` — into a new shared module,
`services/sseStreamMonitor.ts`. Both the scores and odds monitors become
thin instantiations of the same tested code path instead of two
independently-maintained copies.

### `services/sseStreamMonitor.ts` (new)

```ts
export interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}

export function parseSseData(chunk: string): string | null { ... }

export function createSseStreamMonitor(endpointPath: string): {
  getState: () => LiveStreamState;
  connectOnce: () => Promise<void>;
  start: () => void;
}
```

`createSseStreamMonitor` closes over its own private `state` object, so two
independent instances (scores, odds) never share or collide on state. Each
call gets its own `connectOnce`/`start` bound to that instance's state and
`endpointPath`.

`connectOnce` is exposed on the returned object — not only called
internally by `start`'s retry loop — specifically so tests can drive one
connection attempt deterministically without the real 2s-60s backoff
timing.

`start()` keeps today's exact guard and backoff behavior: no-ops when
`config.useSimulatedFeed` or no `config.txlineApiKey`; capped exponential
backoff (2000ms → 60000ms) between reconnect attempts; every error is
caught into `state.lastError`/`state.totalReconnects`, never thrown — a
stream failure can never crash the API process.

`connectOnce`'s per-frame handling is unchanged from today's scores
stream: `JSON.parse(data)` only to confirm the frame is valid JSON
(incrementing `totalEventsReceived`/`lastEventAt`), the parsed value is
discarded, never inspected or stored. This preserves the existing honest
scope boundary — proving connectivity, not trusting payload shape.

### `services/txlineStream.ts` (existing, scores) — becomes a wrapper

```ts
import { createSseStreamMonitor } from "./sseStreamMonitor";

const monitor = createSseStreamMonitor("/api/scores/stream");

export const getLiveStreamState = monitor.getState;
export const startLiveStreamMonitor = monitor.start;
```

Exported names are unchanged, so `server.ts`'s existing imports need no
edits for the scores side. The module's existing top-of-file doc comment
(explaining the additive/observational scope) moves here unchanged.

### `services/txlineOddsStream.ts` (new)

```ts
import { createSseStreamMonitor } from "./sseStreamMonitor";

const monitor = createSseStreamMonitor("/api/odds/stream");

export const getLiveOddsStreamState = monitor.getState;
export const startLiveOddsStreamMonitor = monitor.start;
```

Same shape, same doc-comment pattern, pointed at the odds endpoint.

### `server.ts` — wiring

- Import `getLiveOddsStreamState`, `startLiveOddsStreamMonitor` from the
  new module.
- Call `startLiveOddsStreamMonitor()` immediately alongside the existing
  `startLiveStreamMonitor()` call in the startup block (same guard
  conditions apply inside `start()` itself, so no duplicate guard needed
  at the call site).
- Add `liveOddsStream: getLiveOddsStreamState()` to the `/health` JSON
  response, alongside the existing `liveStream` field.

### `openapi.yaml` — doc sync

Add `liveOddsStream` to the `/health` response schema, mirroring the
existing `liveStream` field's schema shape exactly (same properties:
`connected`, `lastEventAt`, `totalEventsReceived`, `totalReconnects`,
`lastError`).

## Testing

New `services/sseStreamMonitor.test.ts`, mocking `global.fetch`:

- `parseSseData`: existing parsing-correctness cases (multi-line `data:`
  fields, non-SSE chunks return `null`).
- `connectOnce` success path: a mocked SSE body with a valid JSON frame
  increments `totalEventsReceived` and sets `lastEventAt`; a non-JSON
  keepalive/comment frame is ignored (no increment, no error).
- `connectOnce` failure path: a non-ok response or missing body sets
  `state.connected = false` and throws (the caller, `start()`'s loop, is
  what catches it and records `lastError`/`totalReconnects` — tested via
  `start()` with fake timers advancing one backoff cycle, or by asserting
  `connectOnce` rejects directly, whichever proves simpler once writing
  the test).
- Two independently-created monitors (`createSseStreamMonitor("/a")`,
  `createSseStreamMonitor("/b")`) never share state — a state mutation on
  one leaves the other's `getState()` untouched.

No test changes needed for `txlineStream.ts` itself (it has none today,
and its behavior is unchanged — same exported function names, same
runtime behavior, now sourced from tested shared code instead of
untested private code).

## Verification plan

1. `npm test` in `apps/api` — new `sseStreamMonitor.test.ts` passes, full
   suite still green.
2. Local dev run against the real TxLINE feed (`USE_SIMULATED_FEED=false`,
   as already configured in `.env.local`): confirm `GET /health` returns
   both `liveStream` and `liveOddsStream`, both eventually `connected:
   true` with `totalEventsReceived` climbing.
3. After merge and deploy: check `GET /health` on the live production
   endpoint for the new `liveOddsStream` field, and confirm the existing
   `liveStream` (scores) field's behavior is unchanged — same reconnect
   characteristics as before this change, not just present but behaving
   identically to its pre-refactor self.

## Explicitly out of scope

- No use of the odds stream's actual event payload contents — connectivity
  and count only, matching the scores stream's existing scope exactly.
- No change to `agent.ts`'s polling loop or `store.oddsSnapshots` — the
  odds chart and signal generation are entirely unaffected.
- No frontend changes — `/health`'s new field is a backend observability
  addition only, not wired into any dashboard panel this pass.
- No dashboard badge for the odds stream (the scores stream's existing
  "TxLINE push feed connected" badge is not duplicated here — could be a
  future, separate small addition if wanted).
