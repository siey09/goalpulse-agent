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

## Major Features Added After Initial Verification

Beyond the core signal loop verified above, six substantial features were added and verified live in production:

### 1. Real On-Chain Merkle Proof Validation (Solana Mainnet)

GoalPulse calls TxLINE's actual on-chain `Txoracle` Solana program (`GET /api/onchain/validate-stat`) to cryptographically verify that a specific match statistic is provably anchored on-chain, using TxLINE's own `/api/scores/stat-validation` endpoint for the Merkle proof data and a real `.view()` simulation call against the deployed program on Solana mainnet (program id `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`).

This is not a self-generated hash dressed up as "blockchain proof" — it is a genuine call to the sponsor's own on-chain verification program. Verified live: a real stat (`key: 1002, value: 0, period: 4`) from the Colombia vs Ghana fixture returned `isValid: false` against an incorrect threshold and `isValid: true` against the correct one, confirming the full chain (wallet, RPC, PDA derivation, Merkle proof) works end to end. The result is displayed on the live dashboard with a "Verify on Solana" button and a direct link to Solana Explorer for the daily Merkle root PDA. The call is a read-only simulation, so it costs no SOL in transaction fees.

### 2. Simulated P&L (Trading Performance, Not Just Accuracy)

`GET /api/pnl` turns "accuracy %" into an actual trading performance metric: it simulates a flat 1-unit stake on every signal at the decimal odds available when the signal fired, settles it against the real, already-verified match outcome, and reports net units won/lost and ROI%, broken down by severity tier (HIGH/MEDIUM/LOW). This matters because a strategy can be more than 50% accurate and still lose money if winners pay short odds and losers cost a full unit — accuracy alone can be misleading for a trading tool.

### 3. Autonomous Discord Alerts

The agent sends a real Discord webhook alert the moment it detects a HIGH severity signal, with no human triggering it — verified live with a real "SHARP MOVE — Belgium" alert delivered to a Discord channel the moment USA vs Belgium odds compressed 19.64%. This directly strengthens the "fully automated, no manual intervention" bar: GoalPulse doesn't just display signals, it acts on them.

### 4. Multi-Market Signal Detection (Over/Under Total Goals)

Beyond the 1X2 match-winner market, GoalPulse independently tracks the full-match Over/Under Total Goals market (`OVERUNDER_PARTICIPANT_GOALS`, confirmed live against real TxLINE data), using the same signal-detection and settlement logic. Totals snapshots are tracked under a distinct internal id (`<fixtureId>-totals-<line>`) so their price history never mixes with the 1X2 market's history. Settlement correctly resolves "Over 3.5" / "Under 3.5" style signals against the real combined goal count at full time.

### 5. Live TxLINE Push Stream (Beyond Polling)

In addition to the 5-second REST poll loop, the backend maintains a persistent Server-Sent Events connection directly to TxLINE's own real-time stream (`/api/scores/stream`), exposed via `/health` as `liveStream: { connected, lastEventAt, totalEventsReceived }`. Verified live with hundreds of real events received. This is additive and does not replace the tested polling path — it proves genuine push-based connectivity to the sponsor's streaming infrastructure rather than periodic requests.

### 6. In-Play Market Maker

`GET /api/market-maker` computes an independent bid/ask spread around TxLINE's already-de-margined fair odds for each match's outcomes — a genuinely separate model from the signal engine's own compression detection, not a wrapper around it. The spread widens with `fieldPressureScore` (more in-play action means more uncertainty) and with reliability problems (`UNRELIABLE`/`SUSPENDED` data), clamped to a defensible 2-20% range, matching how a real market maker would quote more cautiously on messier data.

## Major Features Added This Session (2026-07-07 to 2026-07-08)

### 1. Agent vs Agent Arena

`GET /api/arena` runs two synthetic trading agents head-to-head on the same live 1X2 signal feed with genuinely opposite strategies, computed live at request time and never touching the mutable agent/store state: **Momentum Follower** takes every signal at face value; **Contrarian** fades signals it classifies as market-only moves (reusing the exact `fieldPressureScore < 22` threshold the dashboard already labels "MARKET-ONLY MOVE"), taking the opposite side at the real quoted price from the original odds snapshot. Settlement is tamper-evident — a SHA-256 hash of both ledgers — and the underlying data can be independently verified via the existing on-chain Merkle proof endpoint, with zero new on-chain code required.

### 2. Insert-Only Signal Archive

Every signal is now appended to a permanent Supabase table (`signal_archive`) at creation and again at settlement, deliberately separate from and never touching the existing restart-recovery snapshot table. This matters specifically for this tournament: the World Cup narrows sharply after 2026-07-11 to just a handful of matches before the July 19 final, and without this feature, most already-generated signals would simply disappear as matches and their odds history age out of the in-memory store's caps and TxLINE's own live-rotation window before the tournament even ends. Readable via `GET /api/archive` (see below); no dashboard panel yet, deliberately deferred until real data has accumulated.

### 3. Signal Archive Read Endpoint

`GET /api/archive` makes the accumulating archive actually queryable — previously the only way to inspect it was browsing the Supabase table directly. Paginated (`page`/`pageSize`, default 25 capped at 100) and filterable (`matchId`/`status`/`market`/`event`). Returns raw event-log rows rather than a collapsed per-signal view, since the table is insert-only by design: a signal usually has both a `created` and a `settled` row, and a caller filtering `event=settled` gets only final outcomes. The `market` filter (`1x2`/`totals`) is inferred from `matchId` containing `-totals-`, reusing the existing multi-market convention with no schema change. Fail-open like the rest of this feature: returns `200` with an empty page instead of an error if Supabase is unconfigured or unreachable.

### 4. Scores-Context Freshness Fix (Real Bug, Found and Fixed)

Found while verifying an Arena result. A single TXODDS Scores context is computed once per poll and was being stamped onto every odds tick selected that poll — including ticks reached far back in history (the signal engine always includes the single strongest historical compression pair, regardless of recency). A reached-back tick could get labeled with a `scoresContext` reflecting a much later real-world moment, mislabeling `fieldPressureScore` — exactly the value Arena's Contrarian agent uses to decide whether to fade a signal. Fixed with a 60-second freshness gate (derived from real gap measurements: normal jitter maxed at 48.2s, the two real violations were 128.9s/302.0s) at both the snapshot layer (`txlineClient.ts`, three call sites) and a second, narrower gap found during review in the signal layer's historical-context fallback (`signalEngine.ts`).

**Deploy-lag note:** while verifying this fix live, the original bug was still reproducing in production after the fix had been merged and pushed — traced to every one of ~99 signals across an 11.5-hour window showing the old pattern, then the single most recent signal showing correct gating. Render's deploy had simply lagged behind the git push; it resolved itself with no further code changes. Lesson: verify against live endpoint behavior, don't assume a push is live.

### 5. Feed Health / Data-Quality Monitoring

`GET /api/feed-health` reports on feed degradation as its own concern, separate from match-odds signals and from `GET /health`'s fast liveness probe: **cycle health** (is the autonomous agent's polling loop running on schedule — a gap over 3x the expected interval, either right now or historically, is flagged), **odds freshness** (has any live match's odds feed gone quiet for over 5 minutes — checked against the match's most recent odds snapshot, not its own timestamp, since a `Match` can't actually sit stale in the store the way an odds snapshot can), and **fixture coverage** (did the live poll loop's existing 14-fixture-per-cycle cap silently drop coverage this cycle — a new `rawFixtureCount` field on `AgentRun` makes this comparable against the already-tracked processed count for the first time). This directly protects against a repeat of two things already found this session: the stale-finished-match-repolling known limitation and the deploy-lag incident above, both of which previously required manually scanning the signal store to notice.

## Bugs Found and Fixed During Live Verification

**Bug 1 — Undocumented StatusId 100.** While verifying production against real matches, the agent could not close out signals for a finished match (Colombia vs Ghana stayed `"live"` at minute 90). Investigation of the raw TxLINE Scores feed showed a `game_finalised` action carrying `StatusId: 100`, a status code not documented in the official TXODDS Scores Product API doc (v1.0, which only lists StatusId 1-18). The status mapping in `txlineClient.ts` was updated to treat `StatusId 100` as `finished`, redeployed, and reverified live: the match correctly flipped to `finished` and both pending signals were immediately evaluated as `correct`, confirmed by the 100% accuracy result above.

**Bug 2 — Snapshot ordering during historical backfill.** After more live verification, 4 signals on a single fixture showed physically implausible odds compression (up to 99% from a single fixed baseline). Root cause: `findPreviousSnapshot()` returned the most recently *stored* snapshot without checking it was chronologically *older* than the new one being processed. When a finished match was re-ingested through the recent-results backfill path, an old pre-match snapshot got compared against an already-stored, much later full-time snapshot as if it were a single live move. Fixed in `agent.ts` by skipping signal generation whenever the candidate previous snapshot is not strictly older than the current snapshot. Reverified live: the bogus signals stopped appearing, and the remaining incorrect signals were legitimate, self-flagged market noise (the system's own "Caution: the latest field event came from the away side" warning correctly caught them in advance).

**Bug 3 — Live fixture coverage could be silently dropped.** The live poll loop processes a capped batch of fixtures per cycle (14, for TxLINE rate/latency reasons) from `/api/fixtures/snapshot`, but the response was not sorted before slicing. With multiple concurrent World Cup matches, a currently in-play fixture could be pushed past the cap by unrelated future-scheduled fixtures, silently dropping live coverage with no error or warning. Fixed by prioritizing fixtures whose kickoff has already passed and are still within a plausible in-play window (kickoff to kickoff + 3 hours) ahead of everything else before slicing.

## Automated Test Coverage and Security Audit

- **113 automated unit tests across 12 files** (Vitest, up from 24 at initial verification) cover the deterministic core: signal threshold classification at the exact 4%/8%/15% boundaries, correct side selection between home/away, multi-market match-label handling, momentum score clamping, signal settlement — including the Over/Under totals settlement logic — the API key authentication middleware's fail-closed behavior, the Supabase persistence service's fail-open behavior against a mocked client, the market maker's spread/reliability model, the Arena's Momentum Follower/Contrarian position logic, the scores-context freshness gate, the insert-only archive's fail-open behavior on both write and read, the archive read endpoint's query-param parsing/clamping, the Outcome Audit council's dissent computation/aggregation, and the feed health module's cycle/odds/coverage checks and status derivation. Test files are excluded from the production TypeScript build output.
- **Git history security audit**: searched the full commit history for accidentally committed secrets (API tokens, wallet keys, webhook URLs) and confirmed none were ever committed. Only `.env.example` (a template with no real values) was ever tracked; `.env.local` and `.secrets/` are gitignored throughout.

## Production Readiness Features (Added After Core Verification)

Beyond the signal-detection and audit features above, six further features were added specifically to make GoalPulse deployable by a professional trading team, not just demoable for judges — all built on genuinely free tiers with no credit card required.

### 1. API Key Authentication

`POST /api/agent/run-once` — the only mutating endpoint in the entire API, confirmed by a full repository search to have zero existing callers before this feature — now requires an `X-API-Key` header, fail-closed: if the server has no key configured, the endpoint always rejects rather than silently allowing access. Every GET endpoint (the entire public dashboard's data source) stays open by deliberate design: a key embedded in the Vite-built frontend bundle would be visible in plain text via browser devtools anyway, so "protecting" GETs that way would add friction without adding real security.

### 2. Rate Limiting, With an Evidence-Based Fix Instead of a Guess

All endpoints are limited to 1200 requests/minute per IP (a single open dashboard tab generates ~132 requests/minute in steady state, measured directly from the frontend's polling intervals, so this leaves wide headroom for real judge/demo traffic while still blocking abuse); `POST /api/agent/run-once` has an additional, stricter 10/minute limit as defense-in-depth alongside the API key.

Getting this right on Render required more than assumption: Express's `trust proxy` setting must match the real number of reverse-proxy hops in front of the app, or the rate limiter either collapses every visitor into one shared bucket or becomes trivially spoofable via a forged `X-Forwarded-For` header. No official Render documentation guarantees an exact hop count, so the deployed backend first shipped with an interim value plus temporary diagnostic logging of the raw incoming header. Real production logs then confirmed exactly 2 hops (a Cloudflare edge IP followed by Render's internal load balancer IP) before the genuine client IP, and `trust proxy` was finalized to `2` based on that direct evidence, with the temporary logging removed.

### 3. Uptime Monitoring

External monitoring via UptimeRobot (free tier) pings `/health` every 5 minutes — no code required, just an operational safety net so an unexpected outage is caught quickly.

### 4. Interactive OpenAPI/Swagger Documentation

A hand-written OpenAPI 3.0 spec (`openapi.yaml`, covering all 13 endpoints with full schema detail) is served live as an interactive Swagger UI at `GET /api/docs` — publicly accessible like every other GET route, so a judge or reviewer can browse and try real requests against the live API with zero setup. Documents the `X-API-Key` requirement and both rate limits precisely rather than leaving them implicit.

### 5. Supabase Persistence — Verified Surviving a Real Render Restart

The backend's store was, until this feature, entirely in-memory and reset on every Render restart — the single biggest production-readiness gap in the whole project. A periodic-snapshot layer now upserts the full store state (matches, signals, odds snapshots, agent runs, recent results) to a free-tier Supabase Postgres table every 30 seconds, fail-open throughout: if Supabase is unreachable or unconfigured, the server runs exactly as it did before, never blocking startup or crashing.

**Verified live in production**: after the Supabase project was created and configured, the Render service was manually restarted. Before the restart, the oldest visible agent-run had `startedAt: 00:07:43`; after the restart completed, the oldest visible agent-run was `00:04:23` — earlier than the pre-restart checkpoint, which is only possible if the store correctly recovered older historical data from Supabase rather than resetting to empty. Direct, reproducible proof the feature works end to end, not just that the code compiles.

### 6. Pinned Case Studies and a Small-Sample-Size Disclaimer

Two of the flagship live case studies from this submission's original verification — Colombia vs Ghana's validated SHARP_MOVE/MOMENTUM_SHIFT signals, and Canada vs Morocco's confirmed Smart Money Trap — were captured verbatim from real production API responses before a later store reset, and were confirmed gone from the live store by checking `/api/signals` directly. They are now pinned as a git-committed, frontend-bundled data file (`apps/web/src/data/pinnedCaseStudies.ts`) rendered in a dedicated "Verified Case Studies — Permanent Record" panel on the dashboard, fully immune to backend restarts or the live in-memory store's volatility.

Because the live `strategyAccuracy` figure can look worse than the strategy's real track record on an unlucky small sample, the dashboard also shows an always-visible disclaimer next to the live accuracy number and the P&L card (e.g. "n=5 closed — too small to be meaningful"), linking directly to the pinned panel so a judge always has permanent, verified evidence alongside the honestly-labeled live number.

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
- Live TxLINE push stream monitor (Server-Sent Events, beyond polling)
- Official historical scores endpoint for backfill
- Fixture prioritization to avoid missing in-play matches
- Odds snapshot history
- Sharp odds movement detection
- Multi-market signal detection (1X2 and Over/Under Total Goals)
- Scores Intelligence Layer
- Field Pressure Index
- Field-backed vs market-only signal labels
- Data reliability filter
- Precise match status and clock
- Final score settlement audit
- Score breakdown evidence for H1, H2, total goals, corners, red cards, and yellow cards
- Real on-chain Merkle proof validation (Solana mainnet)
- Simulated P&L / trading performance tracking
- Autonomous Discord alerts on HIGH severity signals
- Replay mode for repeatable judge demo
- Evidence chain and proof labels
- Pinned, git-committed case studies immune to backend restarts
- Small-sample-size disclaimer alongside live accuracy and P&L
- API key authentication on the mutating endpoint (fail-closed)
- Rate limiting (1200/min general, 10/min on the mutating endpoint)
- External uptime monitoring (UptimeRobot, every 5 minutes)
- Interactive OpenAPI/Swagger documentation at /api/docs
- Supabase periodic-snapshot persistence, verified surviving a real Render restart
- In-Play Market Maker with independent implied-probability quoting
- Agent vs Agent Arena (Momentum Follower vs Contrarian, tamper-evident SHA-256 ledger hash)
- Insert-only permanent signal archive to Supabase, readable via a paginated/filterable read endpoint
- Feed health monitoring (cycle health, live-match odds freshness, fixture coverage) separate from match-odds signals
- 113 automated unit tests

## Outcome Audit Layer

Beyond the core signal loop, GoalPulse includes a second, independent audit layer (`GET /api/replay/backtest`) that replays every stored real TxLINE signal through three additional checks:

- **Three-Agent Council Vote** — each signal is independently scored by a Movement Detector, a Mean Reversion Guard, and an Evidence Correlator, which vote approve, watch, or reject. A signal is only marked "approved" with at least two of three votes, so every decision has a visible, multi-angle rationale instead of a single black-box score.
- **Dissenting-Vote Detail** — each signal now reports `unanimous` (true only when all three agents approved) and `dissentingAgents` (which agent(s) didn't), and the run-level summary reports how often the council actually disagrees (`unanimousSignals`, `dissentingSignals`, `dissentRatePct`, and a per-agent dissent count). Disagreement between the three agents is now queryable data in its own right, not just an internal tiebreak buried inside each signal's raw vote list.
- **Smart Money Trap Detection** — signals that were rejected by the final result are classified as `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating, turning a wrong call into a structured, explainable category instead of a silent miss.
- **Cryptographic Proof Hash** — each audit run hashes the full dataset (snapshot ids, signal outcomes, council decisions) with SHA-256 and reports Solana devnet anchoring readiness, so results are reproducible and tamper-evident.
- **Live Streaming Layer** — `GET /api/live/odds-stream` and `GET /api/live/replay-stream` expose Server-Sent Events so the dashboard updates in real time without polling, including a demo replay mode for judging when no live match is active.

## Technical Summary

The backend is built with Node.js, Express, and TypeScript. It runs an autonomous agent loop that fetches TxLINE market data, enriches fixtures with TXODDS Scores context, normalizes odds snapshots, compares current and previous market prices, generates deterministic signals, and records evidence for audit review.

The frontend is built with React, TypeScript, Vite, Tailwind CSS, and Recharts. It displays market boards, odds movement charts, signal intelligence, field pressure context, settlement audits, replay evidence, and a judge demo guide.

## API Endpoints

- GET /health (includes liveStream connectivity status)
- GET /api/matches
- GET /api/signals
- GET /api/stats
- GET /api/pnl (simulated trading P&L)
- GET /api/agent-runs
- GET /api/odds-history
- GET /api/recent-results
- GET /api/market-maker (independent implied-probability quotes, spread widens with field pressure/reliability)
- GET /api/arena (Momentum Follower vs Contrarian scoreboards, SHA-256 tamper-evident ledger hash)
- GET /api/archive (paginated, filterable read over the permanent signal archive)
- GET /api/feed-health (cycle health, odds freshness, fixture coverage diagnostic)
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events, live)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- GET /api/docs (interactive Swagger UI documenting every endpoint)
- POST /api/agent/run-once (requires X-API-Key header, rate-limited 10/min)

## Demo Flow

1. Open the deployed frontend.
2. Show backend health endpoint, including `liveStream.connected: true`.
3. Show the Market Board with precise status and clock, and the "updated Xs ago" freshness indicator.
4. Show odds movement chart with the color-coded Market Verdict bar.
5. Show Signal Intelligence Panel.
6. Explain TXODDS field context and Field Pressure Index.
7. Show reliability filter.
8. Show Results Settlement Audit.
9. Show score breakdown rows.
10. Show the simulated P&L card (net units, ROI%, severity breakdown).
11. Show replay mode and evidence chain.
12. Run the Outcome Audit: show the council vote, trap classification, and the SHA-256 proof hash.
13. Click "Verify on Solana" and show the real on-chain Merkle proof result with the Solana Explorer link.
14. Show the Colombia vs Ghana case study: SHARP_MOVE and MOMENTUM_SHIFT signals, both confirmed correct after final settlement.
15. Show the Verified Case Studies panel and the small-sample disclaimer next to the live accuracy number.
16. Show GET /api/docs — the interactive Swagger UI documenting every endpoint, including the API key requirement and rate limits.
17. Mention production readiness: API key authentication, rate limiting, external uptime monitoring, and Supabase persistence verified surviving a real Render restart.
18. End with analytics-only compliance boundary.

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
- API key authentication, rate limiting, and Supabase persistence verified live in production on 2026-07-07, including a real manual Render restart that confirmed the store correctly recovered older historical data from Supabase instead of resetting to empty.
- Interactive OpenAPI/Swagger documentation live at /api/docs.
- External uptime monitoring configured via UptimeRobot, pinging /health every 5 minutes.
