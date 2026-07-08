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
- Store evidence-rich signal history in memory, periodically snapshotted to Supabase for restart recovery
- Serve dashboard API endpoints

Important backend files:

- apps/api/src/server.ts
- apps/api/src/types.ts
- apps/api/src/services/txlineClient.ts
- apps/api/src/services/txlineStream.ts (live push-stream connectivity monitor)
- apps/api/src/services/onchainValidation.ts (real on-chain Solana Merkle proof validation)
- apps/api/src/services/alerts.ts (autonomous Discord webhook alerts)
- apps/api/src/services/persistence.ts (Supabase periodic-snapshot save/load, fail-open)
- apps/api/src/services/archive.ts (insert-only permanent Supabase signal archive, fail-open)
- apps/api/src/middleware/apiKeyAuth.ts (X-API-Key authentication, fail-closed)
- apps/api/src/middleware/rateLimiters.ts (general + strict rate limiters)
- apps/api/src/logic/signalEngine.ts
- apps/api/src/logic/marketMaker.ts (independent implied-probability quoting model)
- apps/api/src/logic/arena.ts (Agent vs Agent Arena: Momentum Follower vs Contrarian)
- apps/api/src/logic/scoresContextFreshness.ts (freshness gate for scoresContext vs. tick timestamp)
- apps/api/src/logic/feedHealth.ts (cycle health, odds freshness, and fixture coverage diagnostics)
- apps/api/src/logic/marketConfirmation.ts (band-breach cross-check against the Market Maker's own prior quote)
- apps/api/src/logic/steamDetection.ts (sustained same-direction tick-sequence detection)
- apps/api/src/agent.ts
- apps/api/src/store.ts (in-memory state; recovered from Supabase on startup, see "Supabase Persistence" below)

The frontend is a React, TypeScript, Vite, Tailwind CSS dashboard.

Core dashboard areas:

- Market Board
- Odds movement chart
- Signal Intelligence Panel
- Market Maker Panel
- Agent vs Agent Arena Panel
- Results Settlement Panel
- Replay audit demo
- Judge Demo Guide
- Agent timeline and stats

Important frontend files:

- apps/web/src/App.tsx
- apps/web/src/components/SignalIntelligencePanel.tsx
- apps/web/src/components/MarketMakerPanel.tsx
- apps/web/src/components/ArenaPanel.tsx
- apps/web/src/components/ResultsSettlementPanel.tsx
- apps/web/src/components/VerifiedCaseStudiesPanel.tsx (pinned, restart-immune case studies)
- apps/web/src/data/pinnedCaseStudies.ts (frontend-bundled pinned signal data)

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
- **Dissenting-Vote Detail** (`logic/councilDissent.ts`) — each `councilVotes[]` entry now includes `unanimous` (true only when all 3 agents approved — the only symmetric consensus state possible, since only the Movement Detector can literally vote "reject") and `dissentingAgents` (the names of agents whose vote wasn't "approve"). The response's `summary.councilDissent` aggregates this across the whole run: `unanimousSignals`, `dissentingSignals`, `dissentRatePct`, and `dissentByAgent` (every agent's dissent count, including 0 for agents who never dissent). Makes agent disagreement itself queryable data rather than something only reconstructable by reading three raw vote objects per signal. Backend-only; covered by the same tamper-evident SHA-256 proof hash as the rest of the audit.
- **Smart Money Trap Classification** — signals rejected by the final result are labeled `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating (`EXTREME_REVERSAL`, `MODERATE_REVERSAL`, `NORMAL_WATCH`, or `VALIDATED`). Verified live example: two Canada signals (55.13% and 52.7% odds compression) were both rejected when Canada lost 0-3 to Morocco, and correctly flagged `CONFIRMED_TRAP` with `trapScore: 100` and `EXTREME_REVERSAL`.
- **Cryptographic Proof Hash** — the full dataset (snapshot ids, event ids, signal outcomes, council decisions) is hashed with SHA-256 (Node `crypto` module) and reported with a Solana devnet anchoring readiness flag (`anchoringStatus: "pending_wallet_configuration"` until a wallet/private key is configured).
- **Live Streaming** — `GET /api/live/odds-stream` and `GET /api/live/replay-stream` push updates over Server-Sent Events so the dashboard does not need to poll.

## In-Play Market Maker

`apps/api/src/logic/marketMaker.ts` (`GET /api/market-maker`, `MarketMakerPanel.tsx`) computes an independent bid/ask spread around TxLINE's already-de-margined fair odds for each match's outcomes, without relying on the signal engine at all. The spread starts at a 2% base and widens with `fieldPressureScore` (more in-play action = more uncertainty, up to +6%) and with reliability problems (+4% for `UNRELIABLE`, +8% for `SUSPENDED`), clamped to 2-20%. Always computable from a single snapshot — unlike `buildSignalFromSnapshots`, it needs no previous snapshot to compare against.

## Agent vs Agent Arena

`apps/api/src/logic/arena.ts` (`GET /api/arena`, `ArenaPanel.tsx`) runs two synthetic trading agents head-to-head on the same live 1X2 signal feed, computed live at request time and never touching `agent.ts`/`store.ts`'s mutable state:

- **Momentum Follower** takes every 1X2 signal's own side, target, and odds at face value.
- **Contrarian** fades signals it classifies as market-only moves (`isMarketOnlyMove`, reusing the exact `fieldPressureScore < 22` threshold `SignalIntelligencePanel.tsx` already labels "MARKET-ONLY MOVE"), taking the opposite side at the real quoted price read from the original `OddsSnapshot` the signal was built from — not a synthesized value.

Both settle to `correct`/`incorrect`/`pending` per position and report net units, ROI%, and win rate. Settlement is tamper-evident: a SHA-256 hash of both ledgers, and the underlying data can be independently verified via the existing `GET /api/onchain/validate-stat` — zero new on-chain code was needed. Over/Under totals signals are excluded from both agents (`isTotalsSignal`).

## Insert-Only Signal Archive

`apps/api/src/services/archive.ts` (`signal_archive` Supabase table) appends a permanent record of every signal's state at creation and again at settlement, via `agent.ts` only. Deliberately separate from and never touching `persistence.ts`/`store_snapshots` — that table is a single-row, restart-recovery snapshot; this one is an insert-only, permanently growing history immune to the in-memory store's caps (`oddsSnapshots` capped 800, `signals` capped 100) and to the tournament's own TxLINE live-rotation window. Each row snapshots a shallow copy of the signal (`signal_data: { ...signal }`) at archive-call time, not a live object reference. Fail-open: no-ops if Supabase is unconfigured, and a delivery failure is caught and logged, never thrown, so archiving can never break the agent cycle.

`GET /api/archive` (`services/archive.ts`'s `getArchivedSignals`) reads the table back: paginated (`page`/`pageSize`, default 25 capped at 100) and filterable (`matchId`/`status`/`market`/`event`). Returns raw event-log rows — a signal typically appears twice (`created` and `settled`) — never collapsed to one row per signal, sorted newest-first by `archivedAt`. `market` (`1x2`/`totals`) is inferred from `matchId` containing `-totals-` (`isTotalsMatchId`), reusing the existing multi-market convention rather than requiring a schema change. Fail-open here too: returns `200` with `data: []`/`totalCount: 0` rather than an error if Supabase is unconfigured or the query itself fails. No dashboard panel exists yet. Spec: `docs/superpowers/specs/2026-07-08-archive-read-endpoint-design.md`.

Known limitation: a signal that ages out of the in-memory store's 100-cap before its match finishes never gets a "settled" archive row (pre-existing store behavior, not introduced by this feature) — not every archived signal has a matching settled counterpart.

## Feed Health / Data-Quality Monitoring

`apps/api/src/logic/feedHealth.ts` (`GET /api/feed-health`) reports on feed degradation as its own concern, separate from match-odds signals and from `GET /health`'s fast liveness probe:

- **Cycle health** (`assessCycleHealth`) — a gap, either since the last `AgentRun` or between two consecutive historical runs, counts as "missed" past 3x `config.agentIntervalMs`. Reports both the current gap state (`isCurrentGapExceeded`) and a historical count (`recentMissedCycles`) across all stored `agentRuns`.
- **Odds freshness** (`assessOddsFreshness`) — for each match marked `"live"`, checks its most recent `OddsSnapshot.createdAt` against a fixed 5-minute threshold (`ODDS_STALE_THRESHOLD_MS`), not a multiple of the poll interval, since odds ticks don't arrive every cycle even when healthy. A `Match`'s own `lastUpdated` can't actually go stale while present in `store.matches` (it's wholesale-replaced and re-stamped every cycle), so this checks the odds snapshot instead. A live match with no odds snapshot at all is not flagged — nothing to compare against.
- **Fixture coverage** (`assessFixtureCoverage`) — compares the new `AgentRun.rawFixtureCount` (the count TxLINE returned before the existing 14-fixture-per-cycle cap) against `matchesProcessed` (the post-cap count); a drop means live coverage was silently capped that cycle.
- **Status** (`computeFeedHealthStatus`) — `"down"` if the current cycle gap is exceeded (overrides everything else); `"degraded"` if any historical missed cycle, stale live match, or coverage drop exists; `"healthy"` otherwise.

Backend-only; no dashboard panel yet. Spec: `docs/superpowers/specs/2026-07-08-feed-health-monitoring-design.md`.

## Market Maker Double-Confirmation Cross-Check

`apps/api/src/logic/marketConfirmation.ts` (`GET /api/market-maker/confirmations`) cross-checks every stored signal against a genuinely independent test, avoiding a circularity problem found during design: both `marketMaker.ts`'s spread and `signalEngine.ts`'s momentum score already pull from the same `scoresContext.fieldPressureScore`/`reliability` fields on the same snapshot, so comparing them directly would just agree by construction, not by real confirmation.

Instead, `assessBandBreach` computes what the Market Maker *would have quoted* using the snapshot from **before** the move (`computeMarketMakerQuote(match, previousSnapshot)`), then checks whether the signal's actual post-move odds (`oddsAfter`) broke below that old quote's `bidOdds` for the signal's side. Compression always means the winning side's odds got shorter, so breaching the old bid is the direction-consistent test — a move that outpaced the market's own prior uncertainty allowance at the time, not a restatement of the same input feeding both models. Applies to both 1X2 and Over/Under totals signals (no exclusion needed, unlike Arena's Contrarian agent, since this only needs the same side's own historical band). `summarizeBandBreaches` reports an aggregate `totalChecked`/`confirmedCount`/`unconfirmedCount`/`confirmationRatePct` across the run.

Computed live at request time from `store.signals`/`store.oddsSnapshots`/`store.matches`/`store.recentFinishedMatches`; a signal whose previous snapshot has aged out of the shared 800-entry cache is silently skipped. Backend-only; no dashboard panel yet. Spec: `docs/superpowers/specs/2026-07-08-market-maker-confirmation-design.md`.

## Steam Move Detection

The original ask was cross-book steam detection ("odds moving the same direction across multiple books/lines"). Verified via TxLINE's official docs (txline.txodds.com/documentation/odds/overview): TxLINE's feed is powered by "Stable Price," TxODDS' own consensus pricing engine — lines from global operators are already blended into a single price before reaching this API. `evidence.bookmaker` is effectively a single consensus value, not genuine multi-bookmaker data (confirmed fact, recorded in `PROJECT_STATE.md`'s Architecture section).

Redefined for a single-consensus feed: `apps/api/src/logic/steamDetection.ts` (`GET /api/steam-moves`) detects sustained same-direction pressure across a *sequence* of ticks — distinct from the core signal engine, which only ever compares exactly two snapshots. `detectSteamMove` scans a match's chronologically-sorted tick history for a trailing run of 3+ consecutive same-direction moves, each ≥1% compression, spanning ≤5 minutes from first to last tick in the run; only the most recent (trailing) run is considered, not a historical scan. Checks the home side first, then away. `matchId`/`match` display fields come directly from the snapshots themselves (`matchLabel` if present, else `homeTeam`/`awayTeam`), avoiding a separate `Match` lookup and sidestepping the totals-matchId suffix problem entirely. Applies to both 1X2 and Over/Under totals lines.

Computed live at request time from `store.oddsSnapshots`, grouped by `matchId`; never mutates `agent.ts`/`store.ts`'s state. Backend-only; no dashboard panel yet. Spec: `docs/superpowers/specs/2026-07-08-steam-move-detection-design.md`.

## Known Issues Fixed During Live Verification

**Undocumented StatusId 100.** A `game_finalised` TxLINE Scores action was observed carrying `StatusId: 100`, a value not listed in the official TXODDS Scores Product API doc (v1.0, StatusId 1-18 only). The original `statusFromStatusId()` mapping in `txlineClient.ts` did not treat this as finished, so signals for completed matches stayed pending indefinitely. Fixed by adding `100` to the finished-status set.

**Snapshot ordering during historical backfill.** `findPreviousSnapshot()` in `store.ts` returns the most recently stored snapshot for a match without checking that it is chronologically older than the new snapshot being processed. When a finished match was re-ingested through the recent-results backfill path, older historical snapshots could be compared against an already-stored, much later snapshot, producing nonsensical odds-compression signals (for example, comparing a pre-match snapshot to a full-time snapshot as if it were a single in-play move). Fixed in `agent.ts` by skipping signal generation whenever the candidate previous snapshot is not strictly older than the current snapshot.

**Live fixture coverage could be silently dropped.** The live poll loop in `fetchTxLineFeed` processes a capped batch of fixtures per cycle (14) from `/api/fixtures/snapshot` without sorting the response first. With multiple concurrent World Cup matches, a currently in-play fixture could be pushed past the cap by unrelated future-scheduled fixtures. Fixed with `prioritizeLikelyLiveFixtures()`, which sorts fixtures whose kickoff has already passed and are within a plausible in-play window (kickoff to kickoff + 3 hours) ahead of everything else before slicing.

**Scores-context freshness (found 2026-07-07, while verifying an Agent vs Agent Arena result).** `fetchTxLineFeed()`/`fetchRecentTxLineResults()` in `txlineClient.ts` each compute one `scoresContext` per poll and stamped it onto every odds tick selected that poll — including ticks `selectMovementOdds` reaches far back in history for (it always includes the single strongest historical compression pair, regardless of recency). A reached-back tick could get labeled with a `scoresContext` reflecting a much later real-world moment, mislabeling `fieldPressureScore`. Fixed in two layers: a new `isScoresContextFresh(tickTs, contextTimestamp, toleranceMs)` helper (`logic/scoresContextFreshness.ts`) gates all three `txlineClient.ts` call sites with a 60-second tolerance derived from real gap measurements (normal jitter maxed at 48.2s; the two real violations were 128.9s/302.0s); and a second, narrower gap in `signalEngine.ts`'s `buildSignalFromSnapshots`, whose `current.evidence?.scoresContext ?? previous.evidence?.scoresContext` fallback was never checked against `current`'s own timestamp, fixed the same way. Known residual risk: the gate lives at the three call sites, not inside `normalizeOddsSnapshot`/`normalizeTotalsSnapshot` themselves, so a hypothetical fourth call site that skips the gate would silently reopen the bug.

## Live TxLINE Push Stream Monitor

`apps/api/src/services/txlineStream.ts` maintains a persistent Server-Sent Events connection directly to TxLINE's own `/api/scores/stream` endpoint, with automatic reconnection and capped exponential backoff. This is additive to, and independent from, the 5-second polling loop that remains the source of truth for signal generation. Connectivity state (`connected`, `lastEventAt`, `totalEventsReceived`, `totalReconnects`, `lastError`) is exposed via `/health` and surfaced on the dashboard as a "TxLINE push feed connected (N events)" badge. Started at server boot only when `USE_SIMULATED_FEED=false` and a `TXLINE_API_KEY` is configured; never crashes the process on a connectivity failure.

## Official Historical Scores Endpoint

The recent-results backfill path (`fetchRecentTxLineResults`) uses TxLINE's dedicated `GET /api/scores/historical/{fixtureId}` endpoint (available for fixtures started between two weeks and six hours ago) instead of a single current-state snapshot call. This gives the Scores Intelligence Layer the full play-by-play history to pick the strongest field-context match from. The endpoint's response uses camelCase field names, which differ from the PascalCase used by the live snapshot/update endpoints per the TXODDS Scores Product API doc; `normalizeHistoricalScoreEntry()` defensively accepts either casing so a response-shape change on either endpoint does not silently produce blank field context, with automatic fallback to the current-snapshot endpoint if the historical call fails or the fixture falls outside the two-week window.

## Multi-Market Signal Detection

Alongside the 1X2 match-winner market, GoalPulse independently tracks the full-match Over/Under Total Goals market (`SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS"` with an empty `MarketPeriod`, confirmed live against real TxLINE data; `MarketPeriod: "half=1"`/`"half=2"` variants are per-half lines and are intentionally excluded). Totals snapshots use a distinct `matchId` (`<fixtureId>-totals-<line>`) so their price history is fully isolated from the 1X2 market in the store — mixing the two under one id would let the signal engine compare a 1X2 price against a totals price as if they were the same market. A `matchLabel` field carries the real fixture context (e.g. "Portugal vs Spain") so the signal's `match` display string stays meaningful even though `homeTeam`/`awayTeam` are repurposed as "Over 3.5" / "Under 3.5". Settlement (`evaluatePendingSignalsForFinishedMatches` in `store.ts`) resolves Over/Under signals by comparing the real combined goal count against the line, falling back to the base fixture id (stripping the `-totals-<line>` suffix) to find the final score.

## Real On-Chain Merkle Proof Validation (Solana Mainnet)

`apps/api/src/services/onchainValidation.ts` calls TxLINE's actual `Txoracle` Anchor program deployed on Solana mainnet (program id `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`) via `GET /api/onchain/validate-stat`. The flow: fetch Merkle proof data from TxLINE's own `/api/scores/stat-validation` endpoint for a given fixtureId/seq/statKey, derive the daily Merkle root PDA, and call `program.methods.validateStat(...).view()` — a read-only transaction simulation, so no SOL is spent on network fees. The exact numeric meaning of a given `statKey` is not publicly documented by TxLINE, so this module does not hardcode assumptions about what a key represents; the response surfaces the actual `provenStat` (key/value/period) TxLINE returns so the caller can confirm what was proven. Gracefully reports `available: false` if `SOLANA_WALLET_SECRET_KEY` is not configured, so a missing wallet never breaks the endpoint or the rest of the Outcome Audit. Verified live: a stat from the Colombia vs Ghana fixture (`key: 1002, value: 0, period: 4`) returned `isValid: false` against an incorrect threshold and `isValid: true` against the correct one, confirming the full chain (wallet, RPC, PDA derivation, Merkle proof verification) works end to end on mainnet. Displayed on the dashboard with a direct Solana Explorer link to the daily root PDA.

## Simulated P&L (Trading Performance Tracking)

`getPnlSummary()` in `store.ts` (exposed via `GET /api/pnl`) simulates a flat 1-unit stake on every settled signal at the decimal odds available when the signal fired (`oddsAfter`), settled against the real, already-verified match outcome: `profit = stake * (oddsAfter - 1)` if correct, `-stake` if incorrect. Reports net units, ROI%, and a breakdown by severity tier (HIGH/MEDIUM/LOW), plus open exposure for pending signals. This is a genuine trading-performance metric, not just an accuracy percentage: a strategy can be more than 50% accurate and still lose money if winners pay short odds and losers cost a full unit.

## Autonomous Discord Alerts

`apps/api/src/services/alerts.ts` sends a Discord webhook alert the instant `agent.ts` detects a HIGH severity signal, with no human triggering it. Configured via `DISCORD_WEBHOOK_URL`; silently no-ops if unset, and every delivery attempt is wrapped in try/catch with console logging so a webhook failure can never break the agent cycle. Verified live with a real "SHARP MOVE — Belgium" alert delivered the moment USA vs Belgium odds compressed 19.64%.

## API Key Authentication

`apps/api/src/middleware/apiKeyAuth.ts` protects `POST /api/agent/run-once` — the only mutating endpoint in the API, confirmed via a full repository search to have no existing caller before this feature (not called by the frontend, any script, or Render's own health check, which targets `/health`). Requires an `X-API-Key` header matching `API_ACCESS_KEY`; fail-closed, so an unconfigured key always rejects rather than silently allowing access. Every GET endpoint stays public by design: a key embedded in the Vite-built frontend bundle would be visible in plain text via browser devtools, so "protecting" GETs that way would add friction without adding real confidentiality.

## Rate Limiting

`apps/api/src/middleware/rateLimiters.ts` (via `express-rate-limit`) applies a general 1200 requests/minute-per-IP limit to every route — a single open dashboard tab generates ~132 requests/minute in steady state (measured directly from `apps/web`'s polling intervals), so this leaves wide margin for real judge/demo traffic — and a stricter 10 requests/minute limit specifically on `POST /api/agent/run-once`, stacked in front of its API key check as defense-in-depth.

Correct rate limiting on Render requires Express's `trust proxy` setting to match the real number of reverse-proxy hops in front of the app, or `req.ip` either collapses every visitor into one shared bucket or becomes spoofable via a forged `X-Forwarded-For` header. No official Render documentation guarantees an exact hop count, so the backend first shipped with an interim value (`1`) and temporary diagnostic logging of the raw incoming header. Real production log evidence then showed exactly 2 hops — a Cloudflare edge IP followed by Render's internal load balancer IP — before the genuine client IP, and `trust proxy` was finalized to `2` based on that direct evidence, with the temporary logging removed.

## Interactive OpenAPI/Swagger Documentation

A hand-written OpenAPI 3.0.3 spec at the repo root (`openapi.yaml`) documents all 13 backend endpoints with full schema detail, including the deeply nested `/api/replay/backtest` response, the `X-API-Key` security scheme, and both rate limits. Served live via `swagger-ui-express` + `yamljs` at `GET /api/docs` — a public GET route like any other, so a judge can browse and execute real requests against the live API with zero setup. Validated with `npx @redocly/cli lint openapi.yaml` (0 errors; only cosmetic warnings remain, e.g. missing `operationId` fields).

## Supabase Persistence (Periodic Snapshot Recovery)

`apps/api/src/services/persistence.ts` addresses the backend's original biggest production-readiness gap: `store.ts` was entirely in-memory and reset on every Render restart. `saveSnapshot()` upserts the entire store (matches, recent finished matches, odds snapshots, signals, agent runs) as one JSONB blob into a single-row Supabase Postgres table (`store_snapshots`, always `id = 1` — never grows, no cleanup needed, stays well within the free tier's storage cap) every 30 real wall-clock seconds, tied into the existing agent-cycle scheduler rather than a separate timer. `loadSnapshot()` restores that row into the in-memory store on server startup, before the first agent cycle runs, bounded by an internal timeout so a slow/unreachable Supabase can never hang startup.

Both functions are fail-open: if `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset or Supabase is unreachable, they no-op silently and the server runs exactly as it did before this feature existed — never blocking startup, never crashing an agent cycle. Uses Supabase's modern `sb_secret_` key format (confirmed compatible with `@supabase/supabase-js` as a drop-in replacement for the legacy `service_role` key, and confirmed to still bypass Row Level Security the same way, via Supabase's own documentation).

**Verified live in production**: after configuring a real Supabase project, the Render service was manually restarted. The oldest visible `agent-run` timestamp moved from `00:07:43` (pre-restart) to `00:04:23` (post-restart) — earlier, not reset to empty — which is only possible if the store genuinely recovered older historical data from Supabase rather than starting fresh. Direct, reproducible evidence the feature works end to end.

## Pinned Case Studies and Small-Sample Disclaimer

`apps/web/src/data/pinnedCaseStudies.ts` bundles 4 real signals (2 from Colombia vs Ghana, 2 from Canada vs Morocco), captured verbatim from live production `/api/signals` responses on 2026-07-04/05 before a later store reset — confirmed gone from the live store by checking the endpoint directly on 2026-07-06. Rendered by `apps/web/src/components/VerifiedCaseStudiesPanel.tsx` in a dedicated "Verified Case Studies — Permanent Record" panel, entirely frontend-bundled and never touching the backend store, so it survives any future restart regardless of Supabase's own state.

Because the live `strategyAccuracy` number can look worse than the strategy's real track record on a small, unlucky sample, `App.tsx` also shows an always-visible caption next to the live Accuracy stat tile and inside the P&L card (e.g. "n=5 closed — too small to be meaningful"), linking to the pinned panel so a judge always has both the honest live number and permanent, verified evidence side by side.

## Automated Test Coverage

**126 tests across 14 files** (Vitest, `npm run test` from `apps/api/`): `agent.test.ts`, `logic/arena.test.ts`, `logic/councilDissent.test.ts`, `logic/feedHealth.test.ts`, `logic/marketConfirmation.test.ts`, `logic/marketMaker.test.ts`, `logic/paginationParams.test.ts`, `logic/scoresContextFreshness.test.ts`, `logic/signalEngine.test.ts`, `logic/steamDetection.test.ts`, `middleware/apiKeyAuth.test.ts`, `services/archive.test.ts`, `services/persistence.test.ts`, `store.test.ts`. Covers the deterministic core: severity classification at the exact 4%/8%/15% thresholds, correct side selection between home/away, multi-market `matchLabel` handling, momentum score clamping to 0-100, signal settlement for both the 1X2 market (home/away/draw) and the Over/Under totals market (including matchId-suffix resolution back to the base fixture), the API key middleware's fail-closed behavior, the Supabase persistence service's fail-open behavior against a mocked client, the market maker's spread/reliability model, the Arena's Momentum Follower/Contrarian position logic, the scores-context freshness gate, the insert-only archive's fail-open behavior on both write and read, the archive read endpoint's query-param parsing/clamping, the Outcome Audit council's dissent computation/aggregation, the feed health module's cycle/odds/coverage checks and status derivation, the market maker band-breach cross-check/summary, and the steam detection module's tick-sequence/window/trailing-run logic. Pure logic gets unit tests with plain objects/mocks; anything requiring a real TxLINE/Supabase connection is explicitly not automated (verified instead directly against production). `tsconfig.json` excludes `src/**/*.test.ts` so test files never ship in the production build output.

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
- SOLANA_WALLET_SECRET_KEY (JSON array of secret key bytes; enables real on-chain validation)
- SOLANA_RPC_URL (optional; defaults to the public Solana mainnet-beta RPC)
- DISCORD_WEBHOOK_URL (optional; enables autonomous HIGH severity alerts)
- API_ACCESS_KEY (optional; protects POST /api/agent/run-once via the X-API-Key header. Fail-closed: if unset, the endpoint always rejects rather than allowing access)
- SUPABASE_URL, SUPABASE_SERVICE_KEY (optional; enable both periodic store persistence and the insert-only signal archive to Supabase. Fail-open: if either is unset or Supabase is unreachable, the server runs in-memory only, exactly as before)
- VITE_API_BASE_URL=https://goalpulse-agent-api.onrender.com

Do not commit .env.local, .secrets, or API tokens. A full git-history audit confirmed none have ever been committed; only .env.example (a template with no real values) is tracked.

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
- GET /api/market-maker/confirmations (band-breach cross-check against each signal's own severity)
- GET /api/steam-moves (sustained same-direction tick-sequence detection)
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- GET /api/docs (interactive Swagger UI documenting every endpoint)
- POST /api/agent/run-once (requires X-API-Key header, rate-limited 10/min)

## Known Limitations (Documented, Not Yet Fixed)

- **Stale-finished-match repolling.** A long-finished fixture can still be included in `fetchTxLineFeed()`'s live poll rotation. `selectMovementOdds` re-selects the single strongest historical compression pair on every poll regardless of recency, so once its `OddsSnapshot` ages out of the shared 800-entry cache and more than `signalAlreadyExists`'s 6-hour dedup window has passed, a "new" `AgentSignal` gets created for the exact same historical tick with a fresh `createdAt`. Not a bug in the scores-context freshness fix (which correctly gates the mismatched context in this scenario) — a separate, pre-existing characteristic of the live-polling/dedup design.
- **Exact 60,000ms scores-context freshness boundary is untested** (only 59s/61s either side are tested). Low-risk.
- **Signal archive has no dashboard panel yet** — `GET /api/archive` exists and is queryable, but there's no frontend consumer yet. See "Insert-Only Signal Archive" above.

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
