# Real-Time Push (WebSocket/SSE) for the Frontend — Effort/Benefit Assessment

**Date:** 2026-07-08
**Status:** Assessment only — no implementation plan follows, no code changes made.
**Deliverable per the queue:** a recommendation, not a design to build.

## Current state (more push infrastructure already exists than expected)

The dashboard is not pure polling today. `GET /api/live/odds-stream`
(`server.ts:221`) is a genuine, working SSE endpoint: it polls
`store`'s in-memory state internally every 1 second, computes a
signature of the relevant fields, and only `res.write()`s an
`odds-update` event when that signature actually changes — real
diff-based push, not "send everything every tick." `App.tsx` already
consumes it via a real `EventSource` (`App.tsx:956`), and it drives the
odds-history chart for whichever match is currently selected.

Everything else still polls. Counted directly in the frontend source:

| Loop | Location | Interval | Fetches |
|---|---|---|---|
| Shared dashboard loop | `App.tsx:938` | 5s | `/health`, `/api/matches`, `/api/recent-results`, `/api/signals`, `/api/agent-runs`, `/api/stats`, `/api/pnl` (7 requests, `Promise.all`) |
| Arena | `ArenaPanel.tsx:162` | 5s | `/api/arena` |
| Market Maker | `MarketMakerPanel.tsx:88` | 5s | `/api/market-maker` |
| What-Changed | `WhatChangedPanel.tsx:138` | 5s | (diff panel) |
| Results Settlement | `ResultsSettlementPanel.tsx:170` | 30s | settlement data |
| Signal Intelligence | `SignalIntelligencePanel.tsx:177` | 30s | signal detail |

Six independent polling loops, four of them firing every 5 seconds. The
panels this session added (Feed Health, Steam Moves, Signal Correlation,
Confidence Score, Signal Performance, Backtest) have no dashboard UI at
all yet (explicitly out of scope all session — "backend-only, no
dashboard panel" — per every spec written this session), so they add zero
additional polling load today, but would add more if a panel were ever
built for them using the same pattern.

## The load-bearing fact: push can't outrun the data source

`config.agentIntervalMs` defaults to 3000ms locally; Render production is
configured at `AGENT_INTERVAL_MS=5000` (`PROJECT_STATE.md`'s documented
env vars). That means **the backend's own signal-generation cycle already
runs no faster than every 3-5 seconds** — the same cadence the frontend
polls at. Data in `store.signals`/`store.oddsSnapshots` simply cannot
change faster than the agent cycle produces it. Switching to push
would not surface information any *sooner* in any meaningful sense — at
best it trims the worst-case staleness from "up to one poll interval"
down to whatever the push mechanism's own internal check cadence is (1s,
matching the existing `/api/live/odds-stream` pattern). The user-visible
freshness improvement is on the order of a few seconds, not the
qualitative "instant" jump push architectures usually justify.

## What extending push further would actually require

The existing `/api/live/odds-stream` pattern (signature-diff + 1s
internal poll + SSE write) is proven and could be generalized, but doing
so for the other six polling loops is a real, moderate-to-large lift, not
a small one:

- A new aggregated payload shape covering matches/signals/runs/stats/pnl/
  Arena/Market Maker data together (or several new per-panel SSE routes,
  mirroring the six separate loops) — either way, new response-shape
  design work, not a mechanical port.
- Rewiring every panel's `useState`/`useEffect` fetch-on-interval pattern
  to instead react to `EventSource` message events — touches `App.tsx`
  plus five panel components.
- Reconnection/resync handling: `EventSource` auto-reconnects on drop, but
  a client that was disconnected for N seconds needs a full resync on
  reconnect, not just the next diff — the current single-match odds
  stream has never been stress-tested for this because it only carries
  one match's data, not the whole dashboard's state.
- New failure mode under Render's hosting: SSE connections are long-lived
  by design; this repo's own `PROJECT_STATE.md` already documents Render
  auto-deploy lag as an observed real issue on this exact host. Long-lived
  connections across a redeploy or a free/starter-tier idle-recycle event
  is untested territory here and would need real verification against
  production, not just local dev, to trust before shipping.
- Rate limiting: `generalApiLimiter` currently governs discrete requests;
  a shift to many long-lived connections needs the connection-count
  itself (not just request rate) reasoned about.

None of this is exotic — the codebase already proves the core mechanism
works — but "generalize a proven pattern across 6 more data types with
resync and hosting-reliability work" is a multi-day-scale effort, not an
afternoon.

## Recommendation: do not build this now

**Low priority, do not build for this hackathon.** Three independent
reasons converge on the same answer:

1. **Benefit is small and non-obvious to a judge.** Because the backend's
   own data-generation cadence is 3-5 seconds, push wouldn't make the
   dashboard visibly "more real-time" in any way a judge would notice
   side-by-side against the current 5s poll — the actual win is reduced
   server load (one connection vs. repeated requests across six loops),
   which is invisible in a demo.
2. **This session's own explicit scope boundary.** Every item in this
   queue was deliberately kept backend-only, "not focusing on demo
   polish, judge-facing UI, or presentation right now" (this session's
   standing instruction). Real-time push is entirely frontend/UX-facing
   work — it doesn't fit the depth-and-capability focus the other nine
   items shared.
3. **Real remaining risk given the timeline.** The World Cup narrows to
   ~4 matches after 2026-07-11 with the final on 2026-07-19. A
   moderate-to-large frontend refactor touching six components plus new
   untested hosting-reliability edge cases (reconnect/resync across a
   Render redeploy) is exactly the kind of change that could introduce a
   visible regression close to the deadline, for a benefit that's mostly
   invisible.

**If this is ever revisited** (post-hackathon, or if judges specifically
ask for it): the template already exists and works —
`/api/live/odds-stream`'s signature-diff pattern is the right starting
point, generalized to a consolidated payload rather than six separate
streams, with an explicit resync-on-reconnect step added before trusting
it in production.
