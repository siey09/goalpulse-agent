# GoalPulse Agent Technical Documentation

## Overview

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence system.

It combines live odds movement, TXODDS Scores event context, field pressure scoring, reliability checks, and final score audit evidence to explain sports market movement.

The system is analytics-only. It does not place wagers, custody funds, execute trades, or facilitate betting.

## Architecture

GoalPulse has four main layers:

1. TxLINE feed ingestion
2. TXODDS Scores intelligence enrichment
3. Autonomous signal engine
4. React dashboard and audit interface

## Backend

The backend is a Node.js, Express, and TypeScript API.

Core responsibilities:

- Fetch TxLINE fixtures and odds snapshots
- Fetch TXODDS Scores snapshots per fixture
- Normalize match, odds, and score context
- Run autonomous agent cycles
- Detect odds compression signals
- Attach field event context
- Apply reliability penalties
- Store evidence-rich signal history in memory for the demo
- Serve dashboard API endpoints

Important backend files:

- apps/api/src/server.ts
- apps/api/src/types.ts
- apps/api/src/services/txlineClient.ts
- apps/api/src/logic/signalEngine.ts
- apps/api/src/agent.ts
- apps/api/src/store.ts (in-memory state; resets on process restart)

The frontend is a React, TypeScript, Vite, Tailwind CSS dashboard.

Core dashboard areas:

- Market Board
- Odds movement chart
- Signal Intelligence Panel
- Results Settlement Panel
- Replay audit demo
- Judge Demo Guide
- Agent timeline and stats

Important frontend files:

- apps/web/src/App.tsx
- apps/web/src/components/SignalIntelligencePanel.tsx
- apps/web/src/components/ResultsSettlementPanel.tsx

## TxLINE and TXODDS Scores Usage

The system uses TxLINE odds data for market movement and TXODDS Scores context for match-event explanation.

Scores context can include:

- latest action
- action team
- status id
- status label
- match clock
- scoreline
- possession type
- pressure level
- field pressure score
- reliability status
- score breakdown

## Field Pressure Index

GoalPulse maps field events into pressure levels:

- NONE
- SAFE
- ATTACK
- DANGER
- HIGH_DANGER

Examples:

- safe_possession -> SAFE
- attack_possession or corner -> ATTACK
- shot or danger_possession -> DANGER
- goal, penalty, VAR, red card, or high_danger_possession -> HIGH_DANGER

The field pressure score is added to the signal confidence calculation, while unreliable or suspended feed states reduce confidence.

## Reliability Filter

The signal engine treats the following as warning conditions:

- suspend
- unreliable_corners
- unreliable_yellow_cards
- action_amend
- action_discarded
- suspended coverage status
- unreliable flags from score event data

GoalPulse does not blindly trust every update. It surfaces reliability status as part of the signal evidence.

## Match Status and Clock

The backend maps TXODDS status ids into clearer match labels such as:

- Not Started
- 1st Half
- Half Time
- 2nd Half
- Finished
- Extra Time
- Penalty Shootout
- Interrupted
- Abandoned
- Cancelled
- Coverage Suspended

The frontend displays these precise labels instead of only generic scheduled/live/finished states.

## Final Score Audit

Results Settlement checks whether a previously detected signal was confirmed or rejected after final score settlement.

Audit evidence includes:

- odds endpoint
- scores endpoint
- scoreline
- reliability
- H1 goals
- H2 goals
- total goals
- corners
- red cards
- yellow cards
- bookmaker
- message id

## Outcome Audit Layer (Council Vote, Trap Detection, Proof Hash)

`GET /api/replay/backtest` runs a second, independent audit over stored real TxLINE signals:

- **Three-Agent Council Vote** — Movement Detector, Mean Reversion Guard, and Evidence Correlator each vote approve, watch, or reject on every signal. A signal needs at least 2 of 3 approvals to be marked "approved."
- **Smart Money Trap Classification** — signals rejected by the final result are labeled `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating (`EXTREME_REVERSAL`, `MODERATE_REVERSAL`, `NORMAL_WATCH`, or `VALIDATED`). Verified live example: two Canada signals (55.13% and 52.7% odds compression) were both rejected when Canada lost 0-3 to Morocco, and correctly flagged `CONFIRMED_TRAP` with `trapScore: 100` and `EXTREME_REVERSAL`.
- **Cryptographic Proof Hash** — the full dataset (snapshot ids, event ids, signal outcomes, council decisions) is hashed with SHA-256 (Node `crypto` module) and reported with a Solana devnet anchoring readiness flag (`anchoringStatus: "pending_wallet_configuration"` until a wallet/private key is configured).
- **Live Streaming** — `GET /api/live/odds-stream` and `GET /api/live/replay-stream` push updates over Server-Sent Events so the dashboard does not need to poll.

## Known Issues Fixed During Live Verification

**Undocumented StatusId 100.** A `game_finalised` TxLINE Scores action was observed carrying `StatusId: 100`, a value not listed in the official TXODDS Scores Product API doc (v1.0, StatusId 1-18 only). The original `statusFromStatusId()` mapping in `txlineClient.ts` did not treat this as finished, so signals for completed matches stayed pending indefinitely. Fixed by adding `100` to the finished-status set.

**Snapshot ordering during historical backfill.** `findPreviousSnapshot()` in `store.ts` returns the most recently stored snapshot for a match without checking that it is chronologically older than the new snapshot being processed. When a finished match was re-ingested through the recent-results backfill path, older historical snapshots could be compared against an already-stored, much later snapshot, producing nonsensical odds-compression signals (for example, comparing a pre-match snapshot to a full-time snapshot as if it were a single in-play move). Fixed in `agent.ts` by skipping signal generation whenever the candidate previous snapshot is not strictly older than the current snapshot.

## Signal Thresholds

- LOW watch signal: odds compression >= 4%
- MEDIUM momentum shift: odds compression >= 8%
- HIGH sharp move: odds compression >= 15%

Momentum score combines:

- odds compression
- match time pressure
- score change impact
- field pressure context
- reliability penalty

## Environment Variables

- PORT=4000
- AGENT_INTERVAL_MS=5000
- USE_SIMULATED_FEED=false
- TXLINE_API_BASE_URL=https://txline.txodds.com
- TXLINE_API_TOKEN or TXLINE_API_KEY
- VITE_API_BASE_URL=https://goalpulse-agent-api.onrender.com

Do not commit .env.local, .secrets, or API tokens.

## API Endpoints

- GET /health
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/live/odds-stream (Server-Sent Events)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- POST /api/agent/run-once

## Deployment

- Frontend: Vercel
- Backend: Render
- Repository: GitHub main branch

Production URLs:

- https://goalpulse-agent.vercel.app
- https://goalpulse-agent-api.onrender.com
- https://goalpulse-agent-api.onrender.com/health

## Compliance Boundary

GoalPulse is a decision-support and analytics dashboard. It explains market movement and match context, but it does not execute or facilitate betting.
