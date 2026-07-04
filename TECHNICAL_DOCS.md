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
- apps/api/src/logic/agent.ts

## Frontend

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
