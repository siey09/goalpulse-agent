# GoalPulse Agent

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence dashboard built for the TxLINE Trading Tools and Agents track.

It monitors live football match markets, detects meaningful odds movement, enriches each signal with TXODDS Scores event context, and explains whether a market move is field-backed or market-only.

GoalPulse is analytics-only. It does not place wagers, custody funds, execute trades, or facilitate betting.

## Live Links

- Frontend: https://goalpulse-agent.vercel.app
- Backend API: https://goalpulse-agent-api.onrender.com
- Health Check: https://goalpulse-agent-api.onrender.com/health
- Repository: https://github.com/siey09/goalpulse-agent

## Core Idea

Odds movement alone can be noisy. GoalPulse adds an autonomous intelligence layer that combines odds movement, live score-event context, field pressure, reliability checks, and final score audit evidence.

## Key Features

- Autonomous backend agent loop
- Real TxLINE feed adapter
- Odds snapshot normalization
- Sharp odds movement detection
- TXODDS Scores event context
- Field Pressure Index
- Field-backed vs market-only signal labels
- Reliability filter for suspended, unreliable, amended, or discarded data
- Precise match status and clock labels
- Final score settlement audit
- Score breakdown evidence for H1, H2, total goals, corners, red cards, and yellow cards
- Replay mode for repeatable hackathon demos
- Evidence chain with endpoints, fixture IDs, message IDs, bookmakers, and proof labels
- React dashboard for live monitoring and judge presentation

## Scores Intelligence Layer

GoalPulse uses TXODDS Scores context to explain why an odds move may have happened.

Supported context includes goals, shots, corners, free kicks, penalties, VAR reviews, cards, safe possession, attack possession, danger possession, and high danger possession.

A signal becomes stronger when odds movement occurs near high-pressure field events. If odds move without supporting match context, GoalPulse labels it as market-only movement.

## Field Pressure Index

The Field Pressure Index converts live match actions into an explainable pressure score.

- High danger possession plus odds compression means stronger field-backed evidence.
- Shot, penalty, VAR, red card, or goal near odds movement increases signal strength.
- Odds movement without field context is treated as possible market-only movement.
- Suspended or unreliable data reduces confidence.

## Reliability Filter

GoalPulse lowers or warns confidence when the feed includes suspend, unreliable_corners, unreliable_yellow_cards, action_amend, action_discarded, suspended coverage, or unreliable event flags.

## Signal Thresholds

- HIGH sharp move: odds compression >= 15%
- MEDIUM momentum shift: odds compression >= 8%
- LOW watch signal: odds compression >= 4%
- NO ACTION: movement below threshold

Momentum scoring combines odds compression, match time pressure, score movement, TXODDS field pressure context, and reliability penalties.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts, lucide-react
- Backend: Node.js, Express, TypeScript, TSX
- Deployment: Vercel frontend, Render backend, GitHub main branch

## Project Structure

- apps/api: Express API, TxLINE adapter, autonomous agent, signal engine
- apps/web: React dashboard and judge-facing UI
- DEMO_CHECKLIST.md: demo flow
- SUBMISSION_NOTES.md: hackathon submission summary
- TECHNICAL_DOCS.md: architecture notes

## Local Development

Backend:
cd C:\Projects\goalpulse-agent\apps\api
npm.cmd install
npm.cmd run dev

Frontend:
cd C:\Projects\goalpulse-agent\apps\web
npm.cmd install
$env:VITE_API_BASE_URL="http://localhost:4000"
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort

## Build Checks

cd C:\Projects\goalpulse-agent
npm.cmd --prefix apps\api run build
npm.cmd --prefix apps\web run build

## API Endpoints

- GET /health
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- POST /api/agent/run-once

## Demo Highlights

Judges should look for the live market board, TXODDS field context, Field Pressure Index, field-backed vs market-only labels, final score settlement audit, score breakdown rows, replay mode, and analytics-only compliance boundary.

## Compliance Boundary

GoalPulse explains sports market movement using odds snapshots, scores context, reliability checks, and audit evidence. It does not place bets, recommend wagers as financial advice, custody funds, execute trades, connect to betting accounts, or facilitate illegal betting.
