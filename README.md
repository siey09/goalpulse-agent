# GoalPulse Agent

[![CI](https://github.com/siey09/goalpulse-agent/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/siey09/goalpulse-agent/actions/workflows/ci.yml)

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence dashboard built for the TxLINE Trading Tools and Agents track.

It monitors live football match markets, detects meaningful odds movement, enriches each signal with TXODDS Scores event context, and explains whether a market move is field-backed or market-only.

GoalPulse is analytics-only. It does not place wagers, custody funds, execute trades, or facilitate betting.

The CI badge above reflects whether `main` currently passes. Run `npm run test` in `apps/api` and `apps/web` for the exact current test counts.

## Live Links

- Frontend: https://goalpulse-agent.vercel.app
- Backend API: https://goalpulse-agent-api.onrender.com
- Health Check: https://goalpulse-agent-api.onrender.com/health
- Repository: https://github.com/siey09/goalpulse-agent

## Core Idea

Odds movement alone can be noisy. GoalPulse adds an autonomous intelligence layer that combines odds movement, live score-event context, field pressure, reliability checks, and final score audit evidence.

## Validated Against Live Data

Running live against real TxLINE Service Level 12 data across multiple World Cup fixtures, with confirmed real-outcome accuracy tracking on closed signals. Two concrete case studies from live production data:

- **Colombia vs Ghana** (validated move): SHARP_MOVE and MOMENTUM_SHIFT signals on Colombia, both confirmed `correct` after the match ended 1-0.
- **Canada vs Morocco** (outcome-rejected move): a 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3), and the Outcome Audit layer correctly classified both as `OUTCOME_REJECTED_MOVE` with `EXTREME_REVERSAL` risk, backed by a local SHA-256 audit fingerprint, with the underlying TxLINE data independently verifiable via Solana Merkle proof.

## Key Features

**Signal detection**
- Autonomous backend agent loop with a real TxLINE feed adapter
- Live TxLINE push stream monitor (beyond polling), exposed via `/health`
- Official historical scores endpoint for backfill
- Fixture prioritization to avoid missing in-play matches
- Odds snapshot normalization and sharp odds movement detection
- Multi-market signal detection (1X2 and Over/Under Total Goals), with isolated price history per market
- Draw-side (three-way 1X2) signal generation, settlement, and steam-move detection
- Steam move detection: sustained same-direction tick-sequence pressure, distinct from single-pair compression
- Signal correlation: detects cross-match signal clusters within a short time window, including pattern-matched clusters
- Composite confidence score (0-100) blending magnitude, field pressure, and freshness tightness
- Longshot-odds confidence penalty, calibrated from archived settlement data
- Probability-point-shift reporting, separate from raw odds compression

**Field context and reliability**
- TXODDS Scores event context and Field Pressure Index
- Field-backed vs market-only signal labels
- Reliability filter for suspended, unreliable, amended, or discarded data
- Precise match status and clock labels with a live "updated Xs ago" freshness indicator
- Feed health monitoring (cycle health, odds freshness, fixture coverage)

**Settlement and verification**
- Final score settlement audit with score breakdown evidence (H1, H2, total goals, corners, red cards, yellow cards)
- Real on-chain Merkle proof validation on Solana mainnet — calls TxLINE's actual `Txoracle` program via a genuine `.view()` simulation call
- Verification Depth Score: honest per-signal on-chain verifiability status, never inferred
- Three-agent Council Vote and SHA-256 proof hash on every Outcome Audit run, with queryable dissenting-vote detail
- Failed Continuation and Market Overreaction Detection, with reversal-risk classification
- Evidence chain with endpoints, fixture IDs, message IDs, bookmakers, and proof labels
- Insert-only permanent signal archive to Supabase, readable via a paginated/filterable endpoint
- Historical Pattern Match: ranks past archived signals by similarity to the one currently selected
- Historical hit-rate per signal type, and accuracy bucketed by composite confidence score

**Trading simulation**
- Simulated P&L / trading performance tracking (net units, ROI%, per-severity breakdown)
- Agent vs Agent Arena: Momentum Follower, Contrarian, and Kelly Criterion strategies running head-to-head on the same live signal feed, with tamper-evident SHA-256 ledger hash
- Kelly Criterion risk-limit rejection with an explicit reason code, not just a silent stake clamp
- Retroactive Arena backtest against the full archived signal history
- Meta-agent leader recommendation and Skeptic self-audit (concentration-bias check)
- In-Play Market Maker: independent implied-probability quoting that widens its bid/ask spread with field pressure and reliability problems
- Market Maker double-confirmation cross-check against each signal's own severity

**Operations and trust**
- Autonomous Discord alerts on HIGH severity signals
- Replay mode for repeatable demos
- Pinned, git-committed case studies immune to backend restarts, plus a small-sample-size disclaimer
- API key authentication on the mutating endpoint (fail-closed)
- Rate limiting (1200/min general, 10/min on the mutating endpoint)
- External uptime monitoring, interactive OpenAPI/Swagger documentation at `/api/docs`
- Supabase periodic-snapshot persistence for restart recovery
- SSE stream connectivity status (`STREAMING`/`STALE`/`RECONNECTING`/`STOPPED`) via `/api/metrics`
- CI (GitHub Actions), pinned dependencies, MIT license, explicit CORS origin allowlist

**Dashboard**
- React dashboard restructured into a 9-destination Command Center (Operations: Command Center, Live Markets, Signals; Strategy: Agent Arena, Market Maker, Replay Lab; Trust: Verification, Archive, System Health), also reachable in a single-scroll layout at `?preview=classic`
- Shared design token system and primitives (`Card`, `StatusBadge`, `MetricCard`, `SectionHeader`) so every panel draws from one visual language
- A calibration-bar signature element showing where an observed value lands against the deterministic threshold it crossed
- In-app deterministic "Ask GoalPulse" analyst chat, answering questions about the latest signal, failed-continuation patterns, reversal risk, and score reality checks using only live data — no external LLM call

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
- TECHNICAL_DOCS.md: architecture notes

## Local Development

Backend:
cd apps/api
npm install
npm run dev

Frontend:
cd apps/web
npm install
$env:VITE_API_BASE_URL="http://localhost:4000"
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort

## Build Checks

npm --prefix apps/api run build
npm --prefix apps/web run build

## Tests

cd apps/api
npm run test

## API Endpoints

- GET /health (includes liveStream connectivity status)
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/pnl (simulated trading P&L)
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- GET /api/market-maker (independent implied-probability quotes)
- GET /api/arena (Momentum Follower vs Contrarian vs Kelly Criterion scoreboards)
- GET /api/arena/backtest (retroactive Momentum Follower/Kelly Criterion backtest against the full archive)
- GET /api/archive (paginated, filterable read over the permanent signal archive)
- GET /api/feed-health (cycle health, odds freshness, fixture coverage diagnostic)
- GET /api/market-maker/confirmations (band-breach cross-check against each signal's own severity)
- GET /api/steam-moves (sustained same-direction tick-sequence detection)
- GET /api/signal-correlation (cross-match signal cluster detection)
- GET /api/signal-correlation/patterns (pattern-matched cross-match clusters)
- GET /api/signal-performance (historical hit-rate per signal type)
- GET /api/signal-performance/by-confidence (accuracy bucketed by composite confidence score)
- GET /api/signal-performance/event-latency (event-to-signal timing gap; a proxy metric, not a full reaction-latency pipeline)
- GET /api/archive/similar-signals (ranks past archived signals by similarity to a given one)
- GET /api/metrics (uptime, decision latency, SSE stream status, duplicate-drop counters)
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- GET /api/docs (interactive Swagger UI documenting every endpoint)
- POST /api/agent/run-once (requires X-API-Key header, rate-limited 10/min)

## Demo Highlights

Judges should look for the live market board, TXODDS field context, Field Pressure Index, field-backed vs market-only labels, final score settlement audit, score breakdown rows, replay mode, the Verified Case Studies panel and small-sample disclaimer, the interactive API docs at /api/docs, and analytics-only compliance boundary.

## Current Limitations

Stated honestly:

- **Single-source odds, not multi-bookmaker consensus.** TxLINE's feed is
  powered by TXODDS' own "Stable Price" consensus pricing engine — lines
  across global operators are already blended into one price before
  reaching this API. `evidence.bookmaker` is effectively a constant
  value, not genuine per-bookmaker data. The feed is already de-vigged
  at the source (implied probabilities sum to ~1.0 in real live data),
  so no de-vig calculation is performed by this codebase. Features
  premised on comparing multiple bookmakers or computing cross-bookmaker
  dispersion do not apply to this data source and are not implemented.
- **Risk-limit rejection is a rule, not just a clamp.** Kelly Criterion
  rejects a paper position outright (`risk_limit_exceeded`, surfaced in
  the Arena's rejection reasons) when its raw, uncapped stake fraction
  would exceed the maximum bankroll fraction — the pre-existing 20% cap
  still exists as a display clamp, but the position itself is never
  opened once the raw sizing crosses that line.
- **Probability-point shift is reported alongside raw compression, in
  the signal explanation only.** Signals carry an optional
  `probabilityPointShiftPct` field (a de-vigged implied-probability-point
  shift, distinct from the raw percentage odds compression in
  `oddsChangePct`) and mention it in the explanation text. There is no
  dedicated UI panel or chart for it — it's a backend field plus prose,
  by design, not a gap.
- **In-memory store resets on restart; two different persistence
  mechanisms cover different things.** `store_snapshots` (Supabase) is
  a periodic snapshot for restart recovery only — it is not a
  permanent history. `signal_archive` and `match_archive` are separate,
  genuinely permanent, insert-only Supabase tables that survive both
  restarts and the in-memory store's own retention caps.
- **Free-tier hosting.** Render's backend free tier has a real monthly
  bandwidth cap, and deploys can lag noticeably behind a push to `main`
  — do not assume a push is live within minutes.
- **Tournament-bounded live validation.** As the World Cup narrows
  toward its final, the volume of new live signals available to
  validate new features against shrinks correspondingly; some recent
  additions (e.g. draw-side signal generation) are verified correct by
  unit tests and structurally, but had not yet had a real live
  occurrence to observe end-to-end.

## Compliance Boundary

GoalPulse explains sports market movement using odds snapshots, scores context, reliability checks, and audit evidence. It does not place bets, recommend wagers as financial advice, custody funds, execute trades, connect to betting accounts, or facilitate illegal betting.
