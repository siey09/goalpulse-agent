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

## Verified Live Result

Running live against real TxLINE Service Level 12 data (2026-07-04): 90+ unattended agent cycles, real odds updates across 9 World Cup fixtures, and confirmed real-outcome accuracy tracking on closed signals. Two concrete case studies from live production data:

- **Colombia vs Ghana** (validated move): SHARP_MOVE and MOMENTUM_SHIFT signals on Colombia, both confirmed `correct` after the match ended 1-0.
- **Canada vs Morocco** (confirmed trap): a 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3), and the Outcome Audit layer correctly classified both as `CONFIRMED_TRAP` with `EXTREME_REVERSAL` risk, backed by a real SHA-256 proof hash.

See SUBMISSION_NOTES.md for the full write-up, including three real bugs found and fixed during live verification: an undocumented TxLINE `StatusId: 100` for finished matches, a snapshot-ordering issue during historical backfill, and a fixture-coverage gap that could silently drop live matches.

## Beyond the Core Loop

Five substantial features were added and verified live in production after the initial write-up:

1. **Real on-chain Merkle proof validation on Solana mainnet** — calls TxLINE's actual `Txoracle` program (not a self-generated hash) via a genuine `.view()` simulation call, verified live with a real stat from Colombia vs Ghana. See the "Verify on Solana" button on the dashboard.
2. **Simulated P&L tracking** — turns "accuracy %" into a real trading performance metric (net units, ROI%, per-severity breakdown) using a flat 1-unit stake simulation against real settled outcomes.
3. **Autonomous Discord alerts** — the agent sends a real webhook alert the instant it detects a HIGH severity signal, with no human trigger, verified live.
4. **Multi-market signal detection** — independently tracks the Over/Under Total Goals market alongside 1X2, with isolated price history so the two markets never cross-contaminate each other's signals.
5. **Live TxLINE push stream** — a persistent Server-Sent Events connection directly to TxLINE's own streaming endpoint, additive to the tested polling loop, exposed via `/health`.

Also added: 17 automated unit tests covering the deterministic signal and settlement logic, and a full git-history security audit confirming no secrets were ever committed.

## Key Features

- Autonomous backend agent loop
- Real TxLINE feed adapter
- Live TxLINE push stream monitor (beyond polling)
- Official historical scores endpoint for backfill
- Fixture prioritization to avoid missing in-play matches
- Odds snapshot normalization
- Sharp odds movement detection
- Multi-market signal detection (1X2 and Over/Under Total Goals)
- TXODDS Scores event context
- Field Pressure Index
- Field-backed vs market-only signal labels
- Reliability filter for suspended, unreliable, amended, or discarded data
- Precise match status and clock labels with live "updated Xs ago" freshness indicator
- Final score settlement audit
- Score breakdown evidence for H1, H2, total goals, corners, red cards, and yellow cards
- Real on-chain Merkle proof validation (Solana mainnet)
- Simulated P&L / trading performance tracking
- Autonomous Discord alerts on HIGH severity signals
- Replay mode for repeatable hackathon demos
- Evidence chain with endpoints, fixture IDs, message IDs, bookmakers, and proof labels
- Three-agent Council Vote and SHA-256 proof hash on every Outcome Audit run
- Smart Money Trap detection with reversal-risk classification
- Server-Sent Events live streaming for real-time dashboard updates
- 17 automated unit tests
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

## Tests

cd C:\Projects\goalpulse-agent\apps\api
npm.cmd run test

## API Endpoints

- GET /health (includes liveStream connectivity status)
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/pnl (simulated trading P&L)
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- POST /api/agent/run-once

## Demo Highlights

Judges should look for the live market board, TXODDS field context, Field Pressure Index, field-backed vs market-only labels, final score settlement audit, score breakdown rows, replay mode, and analytics-only compliance boundary.

## Compliance Boundary

GoalPulse explains sports market movement using odds snapshots, scores context, reliability checks, and audit evidence. It does not place bets, recommend wagers as financial advice, custody funds, execute trades, connect to betting accounts, or facilitate illegal betting.
