# P1 Tier 3, P1-16: SSE Stream Status Labels (Scoped-Down)

**Date:** 2026-07-11
**Status:** Approved

## Problem

The original P1-16 ask was a unified 8-state machine
(INITIALIZING/SYNCING/STREAMING/ANALYZING/DEGRADED/RECONNECTING/
CIRCUIT_BREAKER/STOPPED) spanning the whole application. Investigated
before designing anything: this app has three deliberately independent
subsystems (the polling agent loop, which is the documented "source of
truth" for signal generation, plus two separate SSE monitors,
documented as "additive to and independent from" it). The 8 named
states don't map onto one subsystem — some describe app-startup
phases, some describe one SSE connection's lifecycle, one describes
mid-cycle processing, one is a generic catch-all. Forcing them into a
single unified state would misrepresent reality (e.g. "DEGRADED" for
the whole system when only one non-critical SSE monitor reconnected
while the actual signal-generation loop is fine) or require building
three separate state machines under one banner.

**Presented this scoping to the user with an explicit regression-risk
read; user approved the scoped-down version, explicitly rejecting
both a polling-loop circuit breaker and a unified 8-state machine as
real risk to signal generation this close to the tournament ending.**

## Scope: read-only derived status on the two SSE monitors only

**4 states, not 8:** `STREAMING` / `STALE` / `RECONNECTING` / `STOPPED`.
No new stored state, no change to `sseStreamMonitor.ts`'s actual
connect/reconnect/backoff control flow — purely a computed label over
data (`connected`/`lastEventAt`) that already exists and is already
tested.

```typescript
export type StreamStatus = "STREAMING" | "STALE" | "RECONNECTING" | "STOPPED";

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

- `STOPPED`: the feed is disabled by config (`useSimulatedFeed` or no
  `txlineApiKey`) — mirrors the exact condition `start()` already uses
  to no-op, passed in as `isEnabled` since the monitor's own `state`
  can't distinguish "disabled" from "not yet connected" (both look
  identical: `connected: false`, `totalReconnects: 0`).
- `RECONNECTING`: enabled but not currently connected — covers both an
  active backoff retry and the sub-second window before the very
  first connection attempt resolves (the underlying monitor has no
  separate "CONNECTING" state either; not worth a 5th label for a
  window this short, noted honestly in the code comment).
- `STALE`: connected, but either no event has arrived yet
  (`lastEventAt` still `null`) or the last one is older than
  `ODDS_STALE_THRESHOLD_MS` — **reusing the existing constant from
  `logic/feedHealth.ts`** (5 minutes, already used for odds-snapshot
  staleness) rather than inventing a new threshold.
- `STREAMING`: connected, with a confirmed event within the last 5
  minutes.

`deriveStreamStatus` lives in `services/sseStreamMonitor.ts` itself
(co-located with `LiveStreamState`, interpreting the state the same
file produces).

## Where it surfaces

**Backend only, in `GET /api/metrics`** — a new `status: StreamStatus`
field added to the existing `liveStream`/`liveOddsStream` objects in
that response (already this session's precedent extension point for
observability data). **No UI indicator** — user-approved decision:
an internal-observability field doesn't need judge-facing surface, and
a degraded-sounding label during a live demo risks alarming a judge
over what's normally a harmless reconnect blip (the same false-alarm
pattern already documented from the Vercel deploy-transition "Failed
to fetch" errors that self-resolved).

`/health` is explicitly NOT touched — it stays exactly as-is,
preserving its existing fast/stable shape for external uptime
monitors (UptimeRobot, Render's own health check), consistent with
why `/api/metrics` was split out as its own endpoint in P1-15.

## Testing

Unit tests on `deriveStreamStatus` covering all four states plus the
two edge cases explicitly reasoned about above: `isEnabled: false`
always returns `STOPPED` regardless of other state; `connected: true`
with `lastEventAt: null` returns `STALE`; an event exactly at the
`ODDS_STALE_THRESHOLD_MS` boundary and just past it.

## Out of scope (explicitly rejected)

- Any change to the polling agent loop (`processAgentCycle`/
  `runGuardedAgentCycle`) — no circuit breaker, no new failure-counter
  state, no new control flow. Confirmed by investigation: this loop
  has zero existing circuit-breaker substrate today, and adding real
  behavioral logic here risks the one thing that actually generates
  every signal, this close to the tournament ending.
- `INITIALIZING`/`SYNCING`/`ANALYZING`/`DEGRADED`/`CIRCUIT_BREAKER` —
  don't map cleanly onto the SSE-monitor subsystem this item is scoped
  to, and would require inventing new tracked state or new control
  flow to support.
- A UI status indicator — explicitly deferred, backend-only for now.
- Any other remaining rollout item (revisits, mandatory tests,
  Definition of Done) — gated individually per the user's sequencing.
