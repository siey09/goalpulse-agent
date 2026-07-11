# GoalPulse Agent

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence dashboard built for the TxLINE Trading Tools and Agents track.

It monitors live football match markets, detects meaningful odds movement, enriches each signal with TXODDS Scores event context, and explains whether a market move is field-backed or market-only.

GoalPulse is analytics-only. It does not place wagers, custody funds, execute trades, or facilitate betting.

**This README is a project overview, not the current session log.** For
up-to-date, session-by-session detail on what shipped, what's in
progress, and what's deliberately deferred, `PROJECT_STATE.md` at the
repo root is the authoritative reference — it is updated after every
milestone. As of 2026-07-11: 268 automated backend unit tests across
23 files, 26 API endpoints (documented interactively at `/api/docs`).

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
- **Canada vs Morocco** (outcome-rejected move): a 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3), and the Outcome Audit layer correctly classified both as `OUTCOME_REJECTED_MOVE` with `EXTREME_REVERSAL` risk, backed by a real SHA-256 proof hash.

See SUBMISSION_NOTES.md for the full write-up, including three real bugs found and fixed during live verification: an undocumented TxLINE `StatusId: 100` for finished matches, a snapshot-ordering issue during historical backfill, and a fixture-coverage gap that could silently drop live matches.

## Beyond the Core Loop

Six substantial features were added and verified live in production after the initial write-up:

1. **Real on-chain Merkle proof validation on Solana mainnet** — calls TxLINE's actual `Txoracle` program (not a self-generated hash) via a genuine `.view()` simulation call, verified live with a real stat from Colombia vs Ghana. See the "Verify on Solana" button on the dashboard.
2. **Simulated P&L tracking** — turns "accuracy %" into a real trading performance metric (net units, ROI%, per-severity breakdown) using a flat 1-unit stake simulation against real settled outcomes.
3. **Autonomous Discord alerts** — the agent sends a real webhook alert the instant it detects a HIGH severity signal, with no human trigger, verified live.
4. **Multi-market signal detection** — independently tracks the Over/Under Total Goals market alongside 1X2, with isolated price history so the two markets never cross-contaminate each other's signals.
5. **Live TxLINE push stream** — a persistent Server-Sent Events connection directly to TxLINE's own streaming endpoint, additive to the tested polling loop, exposed via `/health`.
6. **In-Play Market Maker** (`GET /api/market-maker`) — an independent implied-probability quoting model that widens its bid/ask spread with field pressure and reliability problems, computed separately from the signal engine's own compression detection.

Also added: 24 automated unit tests covering the deterministic signal and settlement logic (plus API key auth and Supabase persistence), and a full git-history security audit confirming no secrets were ever committed.

## Latest Session (2026-07-07 to 2026-07-10)

1. **Agent vs Agent Arena** (`GET /api/arena`) — three synthetic trading agents run head-to-head on the same live 1X2 signal feed with genuinely different strategies: **Momentum Follower** takes every signal at face value; **Contrarian** fades signals below the same `fieldPressureScore < 22` "market-only move" threshold already shown in the Signal Intelligence Panel, taking the opposite side at the real quoted price from the original snapshot; **Kelly Criterion** takes the same side as the signal but sizes its stake via the Kelly formula, driven by the signal's confidence score. Settlement is tamper-evident (SHA-256 hash of all three ledgers).
2. **Insert-only signal archive** — every signal is appended to a permanent Supabase table (`signal_archive`) at creation and again at settlement, immune to the in-memory store's caps and to the tournament's own live-rotation window. Readable via `GET /api/archive` (paginated, filterable by matchId/status/market/event) and browsable on the dashboard's "Full tournament archive" panel.
3. **Scores-context freshness fix** (real bug, found and fixed) — a single TXODDS Scores context fetched per poll was being stamped onto every odds tick selected that poll, including ticks reached far back in history, which could mislabel `fieldPressureScore` with a stale context. Fixed with a 60-second freshness gate at both the snapshot layer (`txlineClient.ts`) and the signal layer's historical-context fallback (`signalEngine.ts`).
4. **ArenaPanel Kelly Criterion wiring gap** (real bug, found and fixed 2026-07-10) — the backend's `GET /api/arena` had returned three agent scoreboards (Momentum Follower, Contrarian, Kelly Criterion) since Kelly Criterion shipped, but `ArenaPanel.tsx`'s response type only declared the first two, so Kelly Criterion's results were silently dropped from the dashboard. Fixed by completing the frontend type and adding the missing scoreboard card; all three now render.

Also added this session: 63 more automated unit tests (87 total across 10 files, up from 24).

## Production Readiness

Six further features make GoalPulse deployable, not just demoable, all on free tiers with no credit card:

1. **API key authentication** on the one mutating endpoint (`POST /api/agent/run-once`), fail-closed.
2. **Rate limiting** (1200/min general, 10/min on the mutating endpoint) — the `trust proxy` value was finalized from real Render production log evidence (2 hops: Cloudflare + Render's load balancer), not a guess.
3. **External uptime monitoring** via UptimeRobot, pinging `/health` every 5 minutes.
4. **Interactive OpenAPI/Swagger documentation** at `GET /api/docs`, publicly browsable with zero setup.
5. **Supabase periodic-snapshot persistence** — verified live: a manual Render restart showed the store correctly recovered older historical data from Supabase instead of resetting to empty.
6. **Pinned, git-committed case studies** (`apps/web/src/data/pinnedCaseStudies.ts`) immune to backend restarts, plus an always-visible small-sample-size disclaimer next to the live accuracy number and P&L card.

## Deployment Incidents (Found and Fixed)

Beyond code bugs, two real production deployment incidents were found and resolved:

- **Vercel deploy pipeline (2026-07-09)** — the Vercel project had no Git connection at all (every prior deploy was a manual CLI snapshot, so pushes to `main` never triggered a rebuild), and once connected, the first real git-triggered build failed because Root Directory wasn't set to `apps/web`. Both fixed directly in the Vercel dashboard; auto-deploy on push to `main` is now live and confirmed working end-to-end.
- **Render bandwidth suspension (2026-07-10)** — the free-tier backend workspace exceeded its 5GB/month bandwidth allowance (dominated by TxLINE's own outbound service traffic, not HTTP responses to users), which Render suspends all free services for the rest of the calendar month for, with no payment method on file — this would have stayed down past the July 19 deadline if left unfixed. Fixed by adding a card to the Render workspace (overage billed at $0.15/GB, trivially cheap); service confirmed back to "Deployed" and healthy.

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
- Three-agent Council Vote and SHA-256 proof hash on every Outcome Audit run, with queryable dissenting-vote detail (per-signal and aggregate)
- Smart Money Trap detection with reversal-risk classification
- Server-Sent Events live streaming for real-time dashboard updates
- Pinned, git-committed case studies immune to backend restarts
- Small-sample-size disclaimer alongside live accuracy and P&L
- API key authentication on the mutating endpoint (fail-closed)
- Rate limiting (1200/min general, 10/min on the mutating endpoint)
- External uptime monitoring (UptimeRobot)
- Interactive OpenAPI/Swagger documentation at /api/docs
- Supabase periodic-snapshot persistence, verified surviving a real Render restart
- In-Play Market Maker with independent implied-probability quoting
- Agent vs Agent Arena (Momentum Follower vs Contrarian vs Kelly Criterion, tamper-evident SHA-256 ledger hash)
- Insert-only permanent signal archive to Supabase, readable via a paginated/filterable read endpoint
- Feed health monitoring (cycle health, live-match odds freshness, fixture coverage) separate from match-odds signals
- Market Maker double-confirmation cross-check: genuinely independent band-breach test against each signal's own severity
- Steam move detection: sustained same-direction tick-sequence pressure, distinct from single-pair compression
- Signal correlation: detects cross-match signal clusters within a short time window
- Composite confidence score (0-100) on every signal, blending magnitude, field pressure, and freshness tightness
- Historical hit-rate per signal type from the permanent archive, now visible on the dashboard's Signal Performance panel
- Retroactive Arena backtest (Momentum Follower + Kelly Criterion) against the full archived signal history
- Pattern-matched signal correlation: same side/severity/market repeating across matches
- Agent vs Agent Arena third-strategy meta-agent recommendation and Skeptic self-audit (concentration-bias check on whichever agent is currently leading)
- Historical Pattern Match: ranks past archived signals by similarity to the one currently selected
- Verification Depth Score: honest per-signal on-chain verifiability status, never inferred
- Confidence Calibration, Signal Correlation, and Signal Performance dashboard panels backed by the permanent archive
- Draw-side (three-way 1X2) signal generation, settlement, and steam-move detection
- Longshot-odds confidence penalty, calibrated from real archived settlement data
- SSE stream connectivity status (`STREAMING`/`STALE`/`RECONNECTING`/`STOPPED`) via `GET /api/metrics`
- CI (GitHub Actions), pinned dependencies, MIT license
- 268 automated backend unit tests across 23 files
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
- GET /api/signal-performance/event-latency (event-to-signal timing gap; explicitly a proxy metric, not a full reaction-latency pipeline)
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

Stated honestly, as of 2026-07-11:

- **Single-source odds, not multi-bookmaker consensus.** TxLINE's feed is
  powered by TXODDS' own "Stable Price" consensus pricing engine — lines
  across global operators are already blended into one price before
  reaching this API. `evidence.bookmaker` is effectively a constant
  value, not genuine per-bookmaker data. Verified: the feed is already
  de-vigged at the source (implied probabilities sum to ~1.0 in real
  live data), so no de-vig calculation is performed by this codebase —
  it doesn't need to be. Features premised on comparing multiple
  bookmakers or computing cross-bookmaker dispersion do not apply to
  this data source and are not implemented.
- **No explicit risk-limit rejection.** Kelly Criterion caps its stake
  at a maximum bankroll fraction, but nothing in the system rejects a
  paper position outright for exceeding a risk threshold with an
  explicit reason code — the only sizing control is a clamp, not a
  reject.
- **No separate probability-point-shift metric.** Signals report raw
  percentage odds compression (`oddsChangePct`) only. A de-vigged
  implied-probability-point shift is not currently computed or
  surfaced anywhere, despite the underlying data supporting it.
- **In-memory store resets on restart; two different persistence
  mechanisms cover different things.** `store_snapshots` (Supabase) is
  a periodic snapshot for restart recovery only — it is not a
  permanent history. `signal_archive` and `match_archive` are separate,
  genuinely permanent, insert-only Supabase tables that survive both
  restarts and the in-memory store's own retention caps.
- **Free-tier hosting.** Render's backend free tier has a real monthly
  bandwidth cap (hit once, on 2026-07-10, and resolved by adding a
  billing card) and deploys can lag noticeably behind a push to `main`
  — do not assume a push is live within minutes.
- **Tournament-bounded live validation.** As the World Cup narrows
  toward its final, the volume of new live signals available to
  validate new features against shrinks correspondingly; some recent
  additions (e.g. draw-side signal generation) are verified correct by
  unit tests and structurally, but had not yet had a real live
  occurrence to observe end-to-end at the time they shipped.

## Compliance Boundary

GoalPulse explains sports market movement using odds snapshots, scores context, reliability checks, and audit evidence. It does not place bets, recommend wagers as financial advice, custody funds, execute trades, connect to betting accounts, or facilitate illegal betting.
