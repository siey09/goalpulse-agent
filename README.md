# GoalPulse Agent

GoalPulse Agent is an autonomous World Cup odds movement and match momentum detector built for the TxLINE Trading Tools and Agents track.

The system continuously ingests match and odds feed data, stores odds snapshots, detects sharp market movement, generates deterministic agent signals, explains every signal, and displays the results in a live dashboard.

## Core Idea

Live sports odds move quickly during matches. GoalPulse Agent acts as an automated monitoring layer that watches odds movement and match state, then flags meaningful changes without requiring manual human input.

The project is designed as an analytics and market intelligence tool. It does not place wagers, custody funds, or execute betting transactions.

## Features

- Autonomous agent cycle running on a fixed interval
- TxLINE-style live feed ingestion layer
- Match score and minute tracking
- Odds snapshot history
- Sharp odds movement detection
- Momentum score calculation
- Signal generation with severity levels
- Human-readable signal explanations
- Live React dashboard
- Backend API for matches, signals, stats, and odds history

## Agent Logic

The signal engine compares the current odds snapshot against the previous snapshot for each match.

Signal rules:

- HIGH sharp movement: odds compression greater than or equal to 15%
- MEDIUM momentum shift: odds compression greater than or equal to 8%
- LOW watch signal: odds compression greater than or equal to 4%
- NO ACTION: movement below threshold

Momentum score combines odds movement weight, match time pressure, and score change impact.

## Tech Stack

Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts

Backend: Node.js, Express, TypeScript, TSX

## Project Structure

goalpulse-agent/
  apps/
    web/   React dashboard
    api/   Express API and autonomous agent
  package.json
  .gitignore
  README.md

## Local Development

Run backend:

cd apps/api
npm.cmd install
npm.cmd run dev

Backend API: http://localhost:4000

Run frontend:

cd apps/web
npm.cmd install
npm.cmd run dev

Frontend dashboard: http://localhost:5173

## API Endpoints

GET /health
GET /api/matches
GET /api/signals
GET /api/stats
GET /api/agent-runs
GET /api/odds-history?matchId=wc-usa-bra
POST /api/agent/run-once

## Current Prototype Mode

The current version uses a simulated TxLINE-style feed so the autonomous agent and dashboard can be demonstrated even when no live World Cup match is active during judging.

The architecture separates feed ingestion from the signal engine, so the simulated adapter can be replaced with real TxLINE endpoints without changing the dashboard or decision logic.

## Demo Focus

1. Show the problem: live odds move faster than humans can monitor manually.
2. Show the autonomous backend agent running on interval.
3. Show live match and odds snapshots updating.
4. Show agent-generated signals with explanations.
5. Show the dashboard updating automatically.
6. Explain how TxLINE powers the backend architecture.

## Safety Note

GoalPulse Agent is an analytics and monitoring tool. It does not execute wagers, facilitate illegal betting, custody funds, or perform financial transactions.
