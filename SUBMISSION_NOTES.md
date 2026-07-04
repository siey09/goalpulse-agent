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
11. End with analytics-only compliance boundary.

## Safety and Compliance

GoalPulse is a sports analytics and market intelligence tool only. It does not place wagers, custody funds, execute trades, connect to betting accounts, or facilitate betting execution.

## Final Production Verification

- GitHub main branch is updated.
- Frontend is deployed on Vercel.
- Backend is deployed on Render.
- Health check returns 200 OK.
- Production frontend points to Render API, not localhost.
- Latest deployed frontend contains judge guide, score breakdown, field context, and reliability evidence.
