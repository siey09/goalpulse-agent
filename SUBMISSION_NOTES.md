# GoalPulse Agent Submission Notes

## Project Name

GoalPulse Agent

## Track

TxLINE Trading Tools and Agents

## Public Repository

https://github.com/siey09/goalpulse-agent

## Deployed Application

https://goalpulse-agent.vercel.app

## Backend API

https://goalpulse-agent-api.onrender.com

## Health Check

https://goalpulse-agent-api.onrender.com/health

## One-Sentence Summary

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence dashboard that detects meaningful odds movement, enriches signals with TXODDS Scores event context, and audits whether market moves were confirmed or rejected after final score settlement.

## Verified Live Production Evidence

The deployed backend was verified running live against real TxLINE Service Level 12 data on 2026-07-04, with the following confirmed results:

- `/health` confirmed `useSimulatedFeed: false` against the live Render deployment.
- 90+ autonomous agent cycles completed with `status: "success"` on a 5-second interval, unattended.
- 140+ real TxLINE odds updates ingested across 9 live World Cup fixtures in a single monitoring session.
- 10 signals generated from real odds movement, 2 of them HIGH severity.
- Case study: **Colombia vs Ghana** — the agent detected a SHARP_MOVE signal (Colombia odds compressed 25.16%, from 1.59 to 1.19) directly followed by a MOMENTUM_SHIFT signal (1.19 to 1.04, another 12.61%), both automatically enriched with real TXODDS Scores context (`Attack Possession`, 2nd Half, minute 97, scoreline 1-0, corner and card breakdown). When the match finished, both signals were auto-evaluated against the real final score and marked `correct`.
- After the match settled, `strategyAccuracy` reported **100% (2/2 correct, 0 incorrect)** from real, independently verifiable outcomes, not simulated or hand-picked data.

## Bug Found and Fixed During Live Verification

While verifying production against real matches, the agent could not close out signals for a finished match (Colombia vs Ghana stayed `"live"` at minute 90). Investigation of the raw TxLINE Scores feed showed a `game_finalised` action carrying `StatusId: 100`, a status code not documented in the official TXODDS Scores Product API doc (v1.0, which only lists StatusId 1-18). The status mapping in `txlineClient.ts` was updated to treat `StatusId 100` as `finished`, redeployed, and reverified live: the match correctly flipped to `finished` and both pending signals were immediately evaluated as `correct`, confirmed by the 100% accuracy result above. This is documented as a real example of adapting to an undocumented upstream status code discovered through live integration testing, not assumed from the spec alone.

## Problem

Live sports odds can move quickly, but odds movement alone does not explain why the market moved. A price move may be caused by real field pressure, a goal, VAR, penalty, red card, bookmaker adjustment, or market-only activity.

## Solution

GoalPulse adds an autonomous intelligence layer that combines odds movement with TXODDS Scores context, Field Pressure Index scoring, reliability filtering, and final result auditing.

## What Makes It Different

- It does not only detect odds compression.
- It explains whether the movement was field-backed or market-only.
- It attaches live score-event context to each signal.
- It lowers confidence when coverage or event data is unreliable.
- It audits signals after final score settlement.
- It shows endpoint, fixture, bookmaker, message id, scoreline, and score breakdown evidence.

## TxLINE and TXODDS Usage

The deployed version uses the real TxLINE integration path with USE_SIMULATED_FEED=false.

GoalPulse uses:

- TxLINE fixtures and odds snapshots for market movement detection
- TXODDS Scores snapshots for live match-event context
- fixture ids and message ids for evidence traceability
- scoreline and score breakdown data for final settlement audit

## Core Features

- Autonomous agent loop
- Real TxLINE feed adapter
- Odds snapshot history
- Sharp odds movement detection
- Scores Intelligence Layer
- Field Pressure Index
- Field-backed vs market-only signal labels
- Data reliability filter
- Precise match status and clock
- Final score settlement audit
- Score breakdown evidence for H1, H2, total goals, corners, red cards, and yellow cards
- Replay mode for repeatable judge demo
- Evidence chain and proof labels

## Outcome Audit Layer

Beyond the core signal loop, GoalPulse includes a second, independent audit layer (`GET /api/replay/backtest`) that replays every stored real TxLINE signal through three additional checks:

- **Three-Agent Council Vote** — each signal is independently scored by a Movement Detector, a Mean Reversion Guard, and an Evidence Correlator, which vote approve, watch, or reject. A signal is only marked "approved" with at least two of three votes, so every decision has a visible, multi-angle rationale instead of a single black-box score.
- **Smart Money Trap Detection** — signals that were rejected by the final result are classified as `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating, turning a wrong call into a structured, explainable category instead of a silent miss.
- **Cryptographic Proof Hash** — each audit run hashes the full dataset (snapshot ids, signal outcomes, council decisions) with SHA-256 and reports Solana devnet anchoring readiness, so results are reproducible and tamper-evident.
- **Live Streaming Layer** — `GET /api/live/odds-stream` and `GET /api/live/replay-stream` expose Server-Sent Events so the dashboard updates in real time without polling, including a demo replay mode for judging when no live match is active.

## Technical Summary

The backend is built with Node.js, Express, and TypeScript. It runs an autonomous agent loop that fetches TxLINE market data, enriches fixtures with TXODDS Scores context, normalizes odds snapshots, compares current and previous market prices, generates deterministic signals, and records evidence for audit review.

The frontend is built with React, TypeScript, Vite, Tailwind CSS, and Recharts. It displays market boards, odds movement charts, signal intelligence, field pressure context, settlement audits, replay evidence, and a judge demo guide.

## API Endpoints

- GET /health
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/live/odds-stream (Server-Sent Events, live)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- POST /api/agent/run-once

## Demo Flow

1. Open the deployed frontend.
2. Show backend health endpoint.
3. Show the Market Board with precise status and clock.
4. Show odds movement chart.
5. Show Signal Intelligence Panel.
6. Explain TXODDS field context and Field Pressure Index.
7. Show reliability filter.
8. Show Results Settlement Audit.
9. Show score breakdown rows.
10. Show replay mode and evidence chain.
11. Run the Outcome Audit: show the council vote, trap classification, and the SHA-256 proof hash.
12. Show the Colombia vs Ghana case study: SHARP_MOVE and MOMENTUM_SHIFT signals, both confirmed correct after final settlement.
13. End with analytics-only compliance boundary.

## Safety and Compliance

GoalPulse is a sports analytics and market intelligence tool only. It does not place wagers, custody funds, execute trades, connect to betting accounts, or facilitate betting execution.

## Final Production Verification

- GitHub main branch is updated.
- Frontend is deployed on Vercel.
- Backend is deployed on Render.
- Health check returns 200 OK and confirms `useSimulatedFeed: false` in production.
- Production frontend points to Render API, not localhost.
- Latest deployed frontend contains judge guide, score breakdown, field context, and reliability evidence.
- Live agent-runs, signals, and stats endpoints verified directly against the production API on 2026-07-04, including a real 100% strategy accuracy result on closed signals.
