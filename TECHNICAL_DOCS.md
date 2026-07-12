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
- apps/api/src/logic/arena.ts (Agent vs Agent Arena: Momentum Follower vs Contrarian vs Kelly Criterion)
- apps/api/src/logic/backtest.ts (retroactive Momentum Follower/Kelly Criterion backtest against the archive)
- apps/api/src/logic/scoresContextFreshness.ts (freshness gate for scoresContext vs. tick timestamp)
- apps/api/src/logic/feedHealth.ts (cycle health, odds freshness, and fixture coverage diagnostics)
- apps/api/src/logic/marketConfirmation.ts (band-breach cross-check against the Market Maker's own prior quote)
- apps/api/src/logic/steamDetection.ts (sustained same-direction tick-sequence detection)
- apps/api/src/logic/signalCorrelation.ts (cross-match signal cluster detection, deduplicated by real fixture id)
- apps/api/src/logic/signalPerformance.ts (historical hit-rate per signal type from the archive)
- apps/api/src/logic/historicalPatternMatch.ts (nearest-neighbor similar-signal search over the archive)
- apps/api/src/logic/replaySettlement.ts (shared draw/totals-aware settlement logic for the replay path)
- apps/api/src/logic/eventLatency.ts (event-to-market reaction latency metrics)
- apps/api/src/services/sseStreamMonitor.ts (shared connect/reconnect/backoff/status factory for both SSE monitors)
- apps/api/src/services/txlineOddsStream.ts (second SSE connectivity monitor, odds side)
- apps/api/src/agent.ts
- apps/api/src/store.ts (in-memory state; recovered from Supabase on startup, see "Supabase Persistence" below)

## Frontend

The frontend is a React, TypeScript, Vite, Tailwind CSS dashboard.

Command Center is the default experience — a 9-destination layout (Operations: Command Center, Live Markets, Signals; Strategy: Agent Arena, Market Maker, Replay Lab; Trust: Verification, Archive, System Health), rendered via `AppShell` with a grouped sidebar nav. A single-scroll dashboard is also reachable behind `?preview=classic`. Both surfaces share the same underlying panel components and the same top-level data-fetching effects in `App.tsx` — only the layout/routing differs.

Every panel component draws from one shared design-token system (`apps/web/src/styles/tokens.css`) and shared UI primitives (`Card`, `StatusBadge`, `MetricCard`, `SectionHeader`, `EmptyState`, `EvidenceStamp`, `CalibrationBar`) in `apps/web/src/components/ui/`, instead of each panel inventing its own colors and radii.

Important frontend files:

- apps/web/src/App.tsx (data-fetching + both the Command Center and classic-fallback render branches)
- apps/web/src/app/AppShell.tsx (Command Center's persistent sidebar/topbar shell)
- apps/web/src/features/overview/CommandCenterPage.tsx (self-fetches /api/arena for the Strategy Leader/Verification summary cards)
- apps/web/src/features/markets/LiveMarketsPage.tsx (odds chart with the pixel/halftone Area fill pattern)
- apps/web/src/features/*/  (one page per destination: overview, markets, signals, arena, market-maker, replay, verification, archive, health)
- apps/web/src/lib/arena.ts (shared Arena types + getMetaAgentRecommendation, used by both ArenaPanel and CommandCenterPage)
- apps/web/src/components/ui/ (Card, StatusBadge, MetricCard, SectionHeader, EmptyState, EvidenceStamp, CalibrationBar — the shared design system)
- apps/web/src/components/AnalystChatWidget.tsx (deterministic "Ask GoalPulse" chat, no external LLM call — keyword-matched against live signal/replay/audit state)
- apps/web/src/components/signals/SignalAuditDrawer.tsx (per-signal detail drawer: evidence, Arena decisions, on-chain verification)
- apps/web/src/components/SignalIntelligencePanel.tsx
- apps/web/src/components/MarketMakerPanel.tsx
- apps/web/src/components/ArenaPanel.tsx
- apps/web/src/components/ResultsSettlementPanel.tsx
- apps/web/src/components/SignalArchivePanel.tsx (paginated/filterable view over GET /api/archive)
- apps/web/src/components/VerifiedCaseStudiesPanel.tsx (pinned, restart-immune case studies)
- apps/web/src/components/ConfidenceCalibrationPanel.tsx (accuracy bucketed by composite confidence score)
- apps/web/src/components/SteamMoveDetectionPanel.tsx (live-polled, sustained same-direction tick-sequence detection)
- apps/web/src/components/SignalCorrelationPanel.tsx (cross-match signal cluster detection)
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
- **Dissenting-Vote Detail** (`logic/councilDissent.ts`) — each `councilVotes[]` entry includes `unanimous` (true only when all 3 agents approved) and `dissentingAgents` (the names of agents whose vote wasn't "approve"). The response's `summary.councilDissent` aggregates this across the whole run: `unanimousSignals`, `dissentingSignals`, `dissentRatePct`, and `dissentByAgent`. Makes agent disagreement itself queryable data rather than something only reconstructable by reading three raw vote objects per signal. Covered by the same tamper-evident SHA-256 proof hash as the rest of the audit.
- **Failed Continuation and Market Overreaction Detection** (UI label: "Failed Continuation Detector"/"Failed Continuation Assessment"; field names `trapStatus`/`trapScore`/`smartMoneyTraps` unchanged for API-contract stability) — signals rejected by the final result are labeled `OUTCOME_REJECTED_MOVE`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating (`EXTREME_REVERSAL`, `MODERATE_REVERSAL`, `NORMAL_WATCH`, or `VALIDATED`). For example, two Canada signals (55.13% and 52.7% odds compression) were both rejected when Canada lost 0-3 to Morocco, correctly flagged `OUTCOME_REJECTED_MOVE` with `trapScore: 100` and `EXTREME_REVERSAL`.
- **Cryptographic Proof Hash** — the full dataset (snapshot ids, event ids, signal outcomes, council decisions) is hashed with SHA-256 (Node `crypto` module) and reported with a Solana devnet anchoring readiness flag (`anchoringStatus: "pending_wallet_configuration"` until a wallet/private key is configured).
- **Live Streaming** — `GET /api/live/odds-stream` and `GET /api/live/replay-stream` push updates over Server-Sent Events so the dashboard does not need to poll.

## In-Play Market Maker

`apps/api/src/logic/marketMaker.ts` (`GET /api/market-maker`, `MarketMakerPanel.tsx`) computes an independent bid/ask spread around TxLINE's already-de-margined fair odds for each match's outcomes, without relying on the signal engine at all. The spread starts at a 2% base and widens with `fieldPressureScore` (more in-play action = more uncertainty, up to +6%) and with reliability problems (+4% for `UNRELIABLE`, +8% for `SUSPENDED`), clamped to 2-20%. Always computable from a single snapshot — unlike `buildSignalFromSnapshots`, it needs no previous snapshot to compare against.

## Agent vs Agent Arena

`apps/api/src/logic/arena.ts` (`GET /api/arena`, `ArenaPanel.tsx`) runs three synthetic trading agents head-to-head on the same live 1X2 signal feed, computed live at request time and never touching `agent.ts`/`store.ts`'s mutable state:

- **Momentum Follower** takes every 1X2 signal's own side, target, and odds at face value, at a flat 1-unit stake.
- **Contrarian** fades signals it classifies as market-only moves (`isMarketOnlyMove`, reusing the exact `fieldPressureScore < 22` threshold `SignalIntelligencePanel.tsx` labels "MARKET-ONLY MOVE"), taking the opposite side at the real quoted price read from the original `OddsSnapshot` the signal was built from, at a flat 1-unit stake.
- **Kelly Criterion** takes the same side as the signal (a sizing strategy, not a direction strategy) but varies its stake per position using the Kelly formula. Since `confidenceScore` is a quality measure, not a literal win probability, it instead scales an assumed edge over the market's own implied probability (`1/oddsTaken`), capped at `MAX_EDGE = 0.15` (15 percentage points at full confidence). The raw Kelly fraction is capped at `MAX_STAKE_FRACTION = 0.2` then scaled by `KELLY_BANKROLL_UNITS = 10` so stakes land in a range comparable to the other two agents' flat bets (0-2 units). At `confidenceScore = 0` the Kelly fraction is exactly 0 for any odds value, so a zero-confidence signal always stakes nothing. Kelly Criterion rejects a position outright, rather than just capping it, when its raw (uncapped) fraction exceeds `MAX_STAKE_FRACTION` — `exceedsKellyRiskLimit(oddsTaken, confidenceScore)` gates `buildKellyCriterionPosition`, and the rejection reports a `risk_limit_exceeded` reason via the mechanism below.
- **Draw-side signals**: all three agents evaluate draw-side 1X2 signals the same as home/away, except Contrarian, which has no principled "opposite" in a three-outcome market and skips draw signals entirely (rejected with a `draw_signal` reason).
- **Rejection reasons** (`getRejectionReason` in `logic/arena.ts`) — `computeArenaScoreboards` returns a top-level `rejections: ArenaRejection[]` array alongside the three scoreboards, one entry per signal a strategy declined to trade, each with an explicit reason code (`totals_signal`, `not_market_only_move`, `no_original_snapshot`, `draw_signal`, `risk_limit_exceeded`) and human-readable `reasonText`. Rendered on the dashboard as an "N signals not traded" line per agent card.

All three settle to `correct`/`incorrect`/`pending` per position and report net units, ROI%, and win rate. `ArenaPosition` carries an explicit `stakeUnits` field (Momentum Follower/Contrarian always `1`; Kelly varies) so ROI stays mathematically correct once one agent's stakes are variable — `roiPercent` divides net profit by the *sum of actual stakes risked*, not `settledCount × 1`. Settlement is tamper-evident: a SHA-256 hash of all three ledgers, independently verifiable via `GET /api/onchain/validate-stat`. Over/Under totals signals are excluded from all three agents (`isTotalsSignal`). Negating a stake for an incorrect position is written as `0 - stakeUnits`, not `-stakeUnits`, so a legitimately-zero Kelly stake settles to `+0`, not `-0` — relevant because `Object.is(-0, 0)` is `false`, which the test suite's `toBe()` uses.

**Retroactive backtesting** (`apps/api/src/logic/backtest.ts`'s `computeBacktestScoreboards`, `GET /api/arena/backtest`) replays Momentum Follower and Kelly Criterion — reusing their existing builder functions and `arena.ts`'s own `summarize` — against the 500 most recent *settled* entries in the permanent archive, rather than the live, capped-100 `store.signals`. Contrarian is deliberately excluded: `buildContrarianPosition` needs the real match's final score to resolve the opposing side's outcome (a signal's own `resultStatus === "incorrect"` is ambiguous between "the opponent won" and "the match was a draw," and only the raw score disambiguates), and neither `ArchiveEntry` nor the archived `AgentSignal` captures it. The response's `note` field surfaces this exclusion explicitly rather than silently omitting the agent.

## Meta-Agent Recommendation and Skeptic Check

Rendered directly in `ArenaPanel.tsx`, both read-only, both computed frontend-side from `GET /api/arena`'s existing fields:

- **Meta-agent recommendation** (`getMetaAgentRecommendation()`) ranks the three Arena agents by ROI% (stake-size normalized, since Kelly Criterion stakes variable amounts while the other two stake flat 1 unit). Requires `settledCount >= 5` per agent and at least 2 qualifying agents before declaring a leader, and hedges its language when the gap is under 10 percentage points.
- **Skeptic Check** (`getSkepticCritique()`) audits whichever agent the Meta-agent recommendation currently names as leader: groups that agent's settled positions by real fixture id (`baseMatchId`, same pattern as `signalPerformance.ts`'s diversity metrics) and flags when one real match accounts for ≥50% of its settled sample, confirming diversification plainly when it doesn't. Deliberately not a real 4th Arena agent — a critique layer has no side/stake/P&L to track, so it stays outside `ArenaPosition`/`ArenaScoreboard`'s settlement model entirely.

## Verification Depth Score

A plain-label (never a percentage — there is only one real on-chain claim checked per signal today, `statKey=1002`, so a fractional score would be fabricated precision) status badge in the Outcome Audit Layer, next to the "Verify on Solana" button: not independently verifiable / not yet verified / checking on-chain / on-chain verified / verification failed / verification unavailable — always the result of an actual live Solana `.view()` RPC call via `GET /api/onchain/validate-stat`, never inferred.

## Permanent Match Archive

`match_archive` (Supabase) is a second, separate insert-only permanent table alongside `signal_archive`: it records every match's final state the first time it's observed as `"finished"`, independent of whether that match ever produced a signal — closing the gap where a zero-signal match left no permanent trace once it aged out of the in-memory 20-cap `recentFinishedMatches` or the process restarted. Write-only (no read endpoint), same fail-open contract as `archiveSignal`.

## Insert-Only Signal Archive

`apps/api/src/services/archive.ts` (`signal_archive` Supabase table) appends a permanent record of every signal's state at creation and again at settlement, via `agent.ts` only. Separate from `persistence.ts`/`store_snapshots` — that table is a single-row, restart-recovery snapshot; this one is an insert-only, permanently growing history immune to the in-memory store's caps (`oddsSnapshots` capped 800, `signals` capped 100) and to the tournament's own TxLINE live-rotation window. Each row snapshots a shallow copy of the signal (`signal_data: { ...signal }`) at archive-call time, not a live object reference. Fail-open: no-ops if Supabase is unconfigured, and a delivery failure is caught and logged, never thrown, so archiving can never break the agent cycle.

`GET /api/archive` (`services/archive.ts`'s `getArchivedSignals`) reads the table back: paginated (`page`/`pageSize`, default 25 capped at 100) and filterable (`matchId`/`status`/`market`/`event`). Returns raw event-log rows — a signal typically appears twice (`created` and `settled`) — never collapsed to one row per signal, sorted newest-first by `archivedAt`. `market` (`1x2`/`totals`) is inferred from `matchId` containing `-totals-` (`isTotalsMatchId`), reusing the existing multi-market convention rather than requiring a schema change. Fail-open here too: returns `200` with `data: []`/`totalCount: 0` rather than an error if Supabase is unconfigured or the query itself fails.

`apps/web/src/components/SignalArchivePanel.tsx` renders this endpoint with real pagination (Prev/Next) and pill-button filters for `status`/`market`/`event`, plus a debounced (400ms) free-text `matchId` search. Defaults `event` to `settled`, showing one row per fully-resolved signal rather than the raw created+settled event log, so a signal never visibly appears twice by default — a visible `event` pill still exposes the raw log on demand.

Known limitation: a signal that ages out of the in-memory store's 100-cap before its match finishes never gets a "settled" archive row — not every archived signal has a matching settled counterpart.

## Feed Health / Data-Quality Monitoring

`apps/api/src/logic/feedHealth.ts` (`GET /api/feed-health`) reports on feed degradation as its own concern, separate from match-odds signals and from `GET /health`'s fast liveness probe:

- **Cycle health** (`assessCycleHealth`) — a gap, either since the last `AgentRun` or between two consecutive historical runs, counts as "missed" past 3x `config.agentIntervalMs`. Reports both the current gap state (`isCurrentGapExceeded`) and a historical count (`recentMissedCycles`) across all stored `agentRuns`.
- **Odds freshness** (`assessOddsFreshness`) — for each match marked `"live"`, checks its most recent `OddsSnapshot.createdAt` against a fixed 5-minute threshold (`ODDS_STALE_THRESHOLD_MS`), not a multiple of the poll interval, since odds ticks don't arrive every cycle even when healthy. A `Match`'s own `lastUpdated` can't actually go stale while present in `store.matches` (it's wholesale-replaced and re-stamped every cycle), so this checks the odds snapshot instead. A live match with no odds snapshot at all is not flagged — nothing to compare against.
- **Fixture coverage** (`assessFixtureCoverage`) — compares `AgentRun.rawFixtureCount` (the count TxLINE returned before the 14-fixture-per-cycle cap) against `matchesProcessed` (the post-cap count); a drop means live coverage was silently capped that cycle.
- **Status** (`computeFeedHealthStatus`) — `"down"` if the current cycle gap is exceeded (overrides everything else); `"degraded"` if any historical missed cycle, stale live match, or coverage drop exists; `"healthy"` otherwise.

Backend-only; no dashboard panel yet.

## Market Maker Double-Confirmation Cross-Check

`apps/api/src/logic/marketConfirmation.ts` (`GET /api/market-maker/confirmations`) cross-checks every stored signal against a genuinely independent test. `marketMaker.ts`'s spread and `signalEngine.ts`'s momentum score both pull from the same `scoresContext.fieldPressureScore`/`reliability` fields on the same snapshot, so comparing them directly would just agree by construction, not by real confirmation.

Instead, `assessBandBreach` computes what the Market Maker *would have quoted* using the snapshot from **before** the move (`computeMarketMakerQuote(match, previousSnapshot)`), then checks whether the signal's actual post-move odds (`oddsAfter`) broke below that old quote's `bidOdds` for the signal's side. Compression always means the winning side's odds got shorter, so breaching the old bid is the direction-consistent test — a move that outpaced the market's own prior uncertainty allowance at the time, not a restatement of the same input feeding both models. Applies to both 1X2 and Over/Under totals signals. `summarizeBandBreaches` reports an aggregate `totalChecked`/`confirmedCount`/`unconfirmedCount`/`confirmationRatePct` across the run.

Computed live at request time from `store.signals`/`store.oddsSnapshots`/`store.matches`/`store.recentFinishedMatches`; a signal whose previous snapshot has aged out of the shared 800-entry cache is silently skipped. Backend-only; no dashboard panel yet.

## Steam Move Detection

TxLINE's feed is powered by "Stable Price," TxODDS' own consensus pricing engine — lines from global operators are already blended into a single price before reaching this API. `evidence.bookmaker` is effectively a single consensus value, not genuine multi-bookmaker data, so steam detection here is defined for a single-consensus feed rather than as cross-book detection.

`apps/api/src/logic/steamDetection.ts` (`GET /api/steam-moves`) detects sustained same-direction pressure across a *sequence* of ticks — distinct from the core signal engine, which only ever compares exactly two snapshots. `detectSteamMove` scans a match's chronologically-sorted tick history for a trailing run of 3+ consecutive same-direction moves, each ≥1% compression, spanning ≤5 minutes from first to last tick in the run; only the most recent (trailing) run is considered. Checks the home side first, then away. `matchId`/`match` display fields come directly from the snapshots themselves (`matchLabel` if present, else `homeTeam`/`awayTeam`), avoiding a separate `Match` lookup and sidestepping the totals-matchId suffix problem entirely. Applies to both 1X2 and Over/Under totals lines.

Computed live at request time from `store.oddsSnapshots`, grouped by `matchId`; never mutates `agent.ts`/`store.ts`'s state. Backend-only; no dashboard panel yet.

## Signal Correlation Across Simultaneous Matches

`apps/api/src/logic/signalCorrelation.ts` (`GET /api/signal-correlation`) detects when signals fire across 2+ distinct matches close together in time — a cross-match pattern the core signal engine (which only ever reasons about one match) has no visibility into. `findSignalClusters` groups the entire stored signal history (`store.signals`, capped 100) via session-windowing: sorted by `createdAt`, a new group starts whenever the gap to the previous signal in the current group exceeds 5 minutes, so a steady trickle of correlated signals can span longer than 5 minutes in total as long as no single gap exceeds it. Only groups spanning 2+ distinct `matchId`s are reported. Each cluster reports a `severityBreakdown` so significance can be judged directly.

Computed live at request time from `store.signals`; never mutates `agent.ts`/`store.ts`'s state. `matchIds`/`matchCount` on this endpoint and its pattern-matched sibling below are deduplicated by real fixture id (`baseMatchId`) so multiple Over/Under totals lines firing on the same real match don't inflate a cluster into a false multi-match positive. Rendered on the dashboard via `apps/web/src/components/SignalCorrelationPanel.tsx`.

**Pattern-matched correlation** (`GET /api/signal-correlation/patterns`, `findPatternMatchedClusters`) is a stricter, separate detection pass: it only reports a cluster when the *same* pattern — `side` ("direction"), `severity`, and market (`1x2`/`totals`, via the existing `isTotalsSignal` classifier) — repeats across 2+ distinct matches within the window, rather than any signals firing close together regardless of what they say. `signalType` is deliberately excluded from the pattern key, since it's already a deterministic function of `severity` in `signalEngine.ts` (`HIGH→SHARP_MOVE`, `MEDIUM→MOMENTUM_SHIFT`, `LOW→WATCH`). Implemented by partitioning signals by pattern key first, then reusing the same session-windowing algorithm independently within each partition (extracted into a shared `sessionWindowGroups` helper, reused by `findSignalClusters` too).

## Composite Confidence Score and Signal-Type Performance

Every signal carries a `confidenceScore` (0-100, optional field on `AgentSignal`), computed by `calculateConfidenceScore` in `signalEngine.ts` alongside the existing `calculateMomentumScore` — separate from `severity`/`momentumScore`. Blends three weighted components: **magnitude** (weight 0.5, normalized against the existing 15% HIGH severity threshold), **field pressure** (weight 0.3, normalized against `marketMaker.ts`'s `FIELD_PRESSURE_MAX`), and **freshness tightness** (weight 0.2 — `computeFreshnessTightness` in `scoresContextFreshness.ts` reports how close in time the attached `scoresContext` actually is on a 0-100 scale, rather than just whether it passed the pass/fail freshness gate). Weights renormalize among only the available components when `scoresContext` is absent, so a signal with no field context is scored on magnitude alone.

Historical hit-rate per signal type is a separate, async, archive-backed concern: `GET /api/signal-performance` (`logic/signalPerformance.ts`'s `summarizeSignalTypePerformance`) reads the 500 most recent settled entries from the archive and reports accuracy per `signalType`. Deliberately kept out of the synchronous signal-creation loop, since querying Supabase per signal would introduce latency into the pipeline's core synchronous path. Fail-open is inherited automatically from `getArchivedSignals`.

Rendered on the dashboard via `apps/web/src/components/SignalPerformancePanel.tsx` — one card per signal type (sorted by settled count, most statistically meaningful first), color-coded by accuracy threshold.

**Match-diversity metrics (`distinctMatchCount`, `largestMatchSharePct`).** Both fields are computed by `summarizeSignalTypePerformance` from the same already-settled, already-grouped data — `distinctMatchCount` is how many distinct real matches a signal type's settled entries span, `largestMatchSharePct` is what fraction come from its single most-represented match, guarding against a small sample from one match skewing an accuracy figure. Totals sub-market matchIds (`<fixtureId>-totals-<line>`) collapse to their base fixture before counting, so correlated lines on one real match don't inflate the diversity count.

**Confidence-bucketed performance (`GET /api/signal-performance/by-confidence`, `summarizeConfidenceScorePerformance`).** Buckets settled signals by `confidenceScore` range (`0-25`/`25-50`/`50-75`/`75-100`) instead of `signalType`, measuring whether the composite score actually predicts accuracy. Entries missing `confidenceScore` are excluded entirely; empty buckets are omitted rather than shown with a 0%/NaN placeholder; buckets are returned in ascending order. Rendered on the dashboard via `apps/web/src/components/ConfidenceCalibrationPanel.tsx`.

**Longshot confidence penalty.** Accuracy correlates strongly with the underlying decimal odds level, not just the percentage-compression magnitude severity is based on — long-priced signals fired on an already-losing side deep in a match are disproportionately wrong. `LONGSHOT_ODDS_THRESHOLD = 3` / `LONGSHOT_CONFIDENCE_FACTOR = 0.3` (both data-derived values, documented directly in a code comment above the constants) apply a multiplicative penalty to `calculateConfidenceScore` only when `oddsAfter >= 3`; every non-longshot signal's score is unchanged. Kelly Criterion's stake sizing shrinks automatically on longshot signals as a free second-order effect.

**Event-to-market reaction latency (`GET /api/signal-performance/event-latency`, `logic/eventLatency.ts`).** Measures how long the market takes to react to a Scores field event (e.g. a goal) by comparing the event's own timestamp against the signal's `createdAt`. Reports aggregate latency stats (min/max/average) per severity tier from real settled/pending signal history.

**Historical Pattern Match (`GET /api/archive/similar-signals`, `logic/historicalPatternMatch.ts`).** `findSimilarSignals()` ranks the archive's most similar past signals to a given target: hard filter on `signalType`, ranked by distance on `oddsChangePct` and (when both sides have it) `fieldPressureScore`, excluding the target's own match and capping each other match to its 2 closest entries so one match can't dominate the result. Surfaced as a "Similar past signals" section inside the signal detail modal.

## Data-Quality Safeguards

A handful of edge cases in the live feed required explicit handling:

- **StatusId 100.** A `game_finalised` TxLINE Scores action can carry `StatusId: 100`, a value not listed in the official TXODDS Scores Product API doc (v1.0, StatusId 1-18 only). `statusFromStatusId()` in `txlineClient.ts` treats `100` as finished so signals for completed matches don't stay pending indefinitely.
- **Snapshot ordering during historical backfill.** `findPreviousSnapshot()` in `store.ts` returns the most recently stored snapshot for a match. When a finished match is re-ingested through the recent-results backfill path, `agent.ts` skips signal generation whenever the candidate previous snapshot is not strictly older than the current snapshot, preventing a pre-match snapshot from being compared against a full-time snapshot as if it were a single in-play move.
- **Live fixture coverage.** The live poll loop in `fetchTxLineFeed` processes a capped batch of fixtures per cycle (14) from `/api/fixtures/snapshot`. `prioritizeLikelyLiveFixtures()` sorts fixtures whose kickoff has already passed and are within a plausible in-play window (kickoff to kickoff + 3 hours) ahead of everything else before slicing, so an in-play fixture isn't pushed past the cap by unrelated future-scheduled fixtures.
- **Scores-context freshness.** `fetchTxLineFeed()`/`fetchRecentTxLineResults()` in `txlineClient.ts` each compute one `scoresContext` per poll. `isScoresContextFresh(tickTs, contextTimestamp, toleranceMs)` (`logic/scoresContextFreshness.ts`) gates all three `txlineClient.ts` call sites with a 60-second tolerance derived from measured normal jitter, and a matching gate applies in `signalEngine.ts`'s `buildSignalFromSnapshots` fallback, so a reached-back historical tick never gets labeled with a `scoresContext` reflecting a much later real-world moment.
- **Stale-finished-match repolling.** `filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById)` in `txlineClient.ts`, called in `fetchTxLineFeed()` before `prioritizeLikelyLiveFixtures()` runs, excludes any fixture whose ID matched a `Match` with `status === "finished"` in the previous cycle's `store.matches`, so a long-finished fixture can't keep filling a rotation slot and reproducing the same historical signal.
- **Replay-path draw and totals settlement.** `logic/replaySettlement.ts` is the shared settlement module used by both `/api/replay/backtest` and `/api/recent-results`, with a draw-outcome branch (mirroring the live-path settlement in `store.ts`) and correct base-fixture-id resolution for totals signals.

## Deployment Incidents

Two production deployment issues were not code bugs but affected what was visible on the live site: the frontend deploy pipeline was not connected to Git (fixed by connecting the Vercel project to GitHub and setting Root Directory to `apps/web`), and the backend's free-tier bandwidth allowance was exceeded, suspending the service until a billing card was added.

## Live TxLINE Push Stream Monitor

`apps/api/src/services/txlineStream.ts` maintains a persistent Server-Sent Events connection directly to TxLINE's own `/api/scores/stream` endpoint, with automatic reconnection and capped exponential backoff. This is additive to, and independent from, the 5-second polling loop that remains the source of truth for signal generation. Connectivity state (`connected`, `lastEventAt`, `totalEventsReceived`, `totalReconnects`, `lastError`) is exposed via `/health` and surfaced on the dashboard as a "TxLINE push feed connected (N events)" badge. Started at server boot only when `USE_SIMULATED_FEED=false` and a `TXLINE_API_KEY` is configured; never crashes the process on a connectivity failure.

A second, independent stream monitor (`apps/api/src/services/txlineOddsStream.ts`) applies the same connect/reconnect/backoff/parse logic — extracted into a shared `services/sseStreamMonitor.ts` factory (`createSseStreamMonitor`) so both streams run identical tested code — to TxLINE's odds push stream, exposed via `/health` as `liveOddsStream` alongside the existing `liveStream`. Both fields also carry a derived `status` (`STREAMING`/`STALE`/`RECONNECTING`/etc., `deriveStreamStatus` in `sseStreamMonitor.ts`) rather than requiring the reader to interpret `connected`/`lastEventAt`/`staleForMs` manually. Purely observational — proves that JSON frames arrive, never inspects payload contents, never touches `store`.

## Official Historical Scores Endpoint

The recent-results backfill path (`fetchRecentTxLineResults`) uses TxLINE's dedicated `GET /api/scores/historical/{fixtureId}` endpoint (available for fixtures started between two weeks and six hours ago) instead of a single current-state snapshot call. This gives the Scores Intelligence Layer the full play-by-play history to pick the strongest field-context match from. The endpoint's response uses camelCase field names, which differ from the PascalCase used by the live snapshot/update endpoints; `normalizeHistoricalScoreEntry()` defensively accepts either casing so a response-shape change on either endpoint does not silently produce blank field context, with automatic fallback to the current-snapshot endpoint if the historical call fails or the fixture falls outside the two-week window.

## Draw-Side Signals (Three-Way Market Model)

The signal engine evaluates all three 1X2 outcomes — home, draw, and away — not just home/away. `buildSignalFromSnapshots` in `signalEngine.ts` picks whichever of the three sides shows the largest compression; settlement (`evaluatePendingSignalsForFinishedMatches` in `store.ts`, and the equivalent replay-path logic in `logic/replaySettlement.ts`) resolves a draw-side signal as correct when the final score is level. Contrarian is the one place a draw signal is deliberately not traded (see Agent vs Agent Arena above) — there is no principled "opposite side" to fade in a three-outcome market.

## Probability-Point Shift (Separate From Raw Compression)

Every signal reports `oddsChangePct` (raw percentage odds compression) and, since TxLINE's feed is already de-vigged at the source, an additional optional `probabilityPointShiftPct` — a de-vigged implied-probability-point shift (`(1/oddsAfter - 1/oddsBefore) * 100`), same sign convention as `oddsChangePct` but a genuinely different number. Surfaced in the signal's `explanation` text as a distinct sentence; no dedicated UI panel, by design.

## Multi-Market Signal Detection

Alongside the 1X2 match-winner market, GoalPulse independently tracks the full-match Over/Under Total Goals market (`SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS"` with an empty `MarketPeriod`; `MarketPeriod: "half=1"`/`"half=2"` variants are per-half lines and are intentionally excluded). Totals snapshots use a distinct `matchId` (`<fixtureId>-totals-<line>`) so their price history is fully isolated from the 1X2 market in the store. A `matchLabel` field carries the real fixture context (e.g. "Portugal vs Spain") so the signal's `match` display string stays meaningful even though `homeTeam`/`awayTeam` are repurposed as "Over 3.5" / "Under 3.5". Settlement (`evaluatePendingSignalsForFinishedMatches` in `store.ts`) resolves Over/Under signals by comparing the real combined goal count against the line, falling back to the base fixture id (stripping the `-totals-<line>` suffix) to find the final score.

## Real On-Chain Merkle Proof Validation (Solana Mainnet)

`apps/api/src/services/onchainValidation.ts` calls TxLINE's actual `Txoracle` Anchor program deployed on Solana mainnet (program id `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`) via `GET /api/onchain/validate-stat`. The flow: fetch Merkle proof data from TxLINE's own `/api/scores/stat-validation` endpoint for a given fixtureId/seq/statKey, derive the daily Merkle root PDA, and call `program.methods.validateStat(...).view()` — a read-only transaction simulation, so no SOL is spent on network fees. The exact numeric meaning of a given `statKey` is not publicly documented by TxLINE, so this module does not hardcode assumptions about what a key represents; the response surfaces the actual `provenStat` (key/value/period) TxLINE returns so the caller can confirm what was proven. Gracefully reports `available: false` if `SOLANA_WALLET_SECRET_KEY` is not configured, so a missing wallet never breaks the endpoint or the rest of the Outcome Audit. For example, a stat from the Colombia vs Ghana fixture (`key: 1002, value: 0, period: 4`) returns `isValid: false` against an incorrect threshold and `isValid: true` against the correct one. Displayed on the dashboard with a direct Solana Explorer link to the daily root PDA.

## Simulated P&L (Trading Performance Tracking)

`getPnlSummary()` in `store.ts` (exposed via `GET /api/pnl`) simulates a flat 1-unit stake on every settled signal at the decimal odds available when the signal fired (`oddsAfter`), settled against the real, already-verified match outcome: `profit = stake * (oddsAfter - 1)` if correct, `-stake` if incorrect. Reports net units, ROI%, and a breakdown by severity tier (HIGH/MEDIUM/LOW), plus open exposure for pending signals. This is a genuine trading-performance metric, not just an accuracy percentage: a strategy can be more than 50% accurate and still lose money if winners pay short odds and losers cost a full unit.

## Autonomous Discord Alerts

`apps/api/src/services/alerts.ts` sends a Discord webhook alert the instant `agent.ts` detects a HIGH severity signal, with no human triggering it. Configured via `DISCORD_WEBHOOK_URL`; silently no-ops if unset, and every delivery attempt is wrapped in try/catch with console logging so a webhook failure can never break the agent cycle.

## API Key Authentication

`apps/api/src/middleware/apiKeyAuth.ts` protects `POST /api/agent/run-once` — the only mutating endpoint in the API. Requires an `X-API-Key` header matching `API_ACCESS_KEY`; fail-closed, so an unconfigured key always rejects rather than silently allowing access. Every GET endpoint stays public by design: a key embedded in the Vite-built frontend bundle would be visible in plain text via browser devtools, so "protecting" GETs that way would add friction without adding real confidentiality.

## Rate Limiting

`apps/api/src/middleware/rateLimiters.ts` (via `express-rate-limit`) applies a general 1200 requests/minute-per-IP limit to every route, and a stricter 10 requests/minute limit specifically on `POST /api/agent/run-once`, stacked in front of its API key check as defense-in-depth.

Correct rate limiting on Render requires Express's `trust proxy` setting to match the real number of reverse-proxy hops in front of the app, or `req.ip` either collapses every visitor into one shared bucket or becomes spoofable via a forged `X-Forwarded-For` header. `trust proxy` is set to `2`, matching the real hop count in front of the app on Render (a Cloudflare edge IP followed by Render's internal load balancer IP).

## Production Hardening (CI, Dependencies, CORS, Idempotency, Metrics)

- **CI**: `.github/workflows/ci.yml` runs backend tests+build and frontend lint+build in parallel on every push/PR to `main`.
- **Pinned dependencies**: dependency versions in both `package.json` files are pinned to specific ranges rather than `"latest"`.
- **CORS**: `server.ts` restricts cross-origin browser access to an explicit allowlist (the production Vercel origin plus local dev origins) via a function-based origin check that still passes through requests with no `Origin` header (curl, server-to-server, direct navigation) unaffected.
- **LICENSE**: MIT license at the repo root.
- **Idempotency**: `signal_archive`/`match_archive` use `.upsert(..., { ignoreDuplicates: true })` instead of a plain insert, guarding against a restart-timing race (a crash during the periodic-snapshot save window followed by restart from a slightly-stale snapshot could otherwise re-detect and re-archive an already-archived signal/match).
- **Bounded queues**: every in-memory array is capped (`oddsSnapshots` 800, `signals` 100, `agentRuns` 50, `recentFinishedMatches` 20).
- **Basic metrics** (`GET /api/metrics`, separate from `/health`): `uptimeSeconds`, `lastAgentCycle.decisionLatencyMs`, `liveStream`/`liveOddsStream.staleForMs`, and duplicate-drop counters (`store.duplicatesDropped.{snapshots,signals}`) — all persisted/restored across restarts via the existing Supabase snapshot round-trip.
- **Risk-limit rejection**: Kelly Criterion rejects a position outright rather than silently clamping it once its raw stake sizing exceeds the maximum bankroll fraction (see Agent vs Agent Arena above).
- **Probability-point shift reporting**: signals report a de-vigged implied-probability-point shift separately from raw odds compression (see "Probability-Point Shift" above).

## Interactive OpenAPI/Swagger Documentation

A hand-written OpenAPI 3.0.3 spec at the repo root (`openapi.yaml`) documents all backend endpoints with full schema detail, including the deeply nested `/api/replay/backtest` response, the `X-API-Key` security scheme, and both rate limits. Served live via `swagger-ui-express` + `yamljs` at `GET /api/docs` — a public GET route like any other, so a judge can browse and execute real requests against the live API with zero setup.

## Supabase Persistence (Periodic Snapshot Recovery)

`apps/api/src/services/persistence.ts` gives the backend restart recovery: `store.ts` is otherwise entirely in-memory and would reset on every restart. `saveSnapshot()` upserts the entire store (matches, recent finished matches, odds snapshots, signals, agent runs) as one JSONB blob into a single-row Supabase Postgres table (`store_snapshots`, always `id = 1`) every 30 real wall-clock seconds, tied into the existing agent-cycle scheduler. `loadSnapshot()` restores that row into the in-memory store on server startup, before the first agent cycle runs, bounded by an internal timeout so a slow/unreachable Supabase can never hang startup.

Both functions are fail-open: if `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset or Supabase is unreachable, they no-op silently and the server runs in-memory only, never blocking startup, never crashing an agent cycle. Uses Supabase's `sb_secret_` key format, a drop-in replacement for the legacy `service_role` key that still bypasses Row Level Security the same way.

## Pinned Case Studies and Small-Sample Disclaimer

`apps/web/src/data/pinnedCaseStudies.ts` bundles real signals captured from live production `/api/signals` responses, rendered by `apps/web/src/components/VerifiedCaseStudiesPanel.tsx` in a dedicated "Verified Case Studies — Permanent Record" panel, entirely frontend-bundled and never touching the backend store, so it survives any future restart regardless of Supabase's own state.

Because the live `strategyAccuracy` number can look worse than the strategy's real track record on a small, unlucky sample, `App.tsx` also shows an always-visible caption next to the live Accuracy stat tile and inside the P&L card (e.g. "n=5 closed — too small to be meaningful"), linking to the pinned panel so a judge always has both the honest live number and permanent, verified evidence side by side.

## Automated Test Coverage

Vitest test suites (`npm run test` from `apps/api/` and `apps/web/` for the current counts; the repo's CI badge in `README.md` reflects whether `main` currently passes) cover the deterministic core: severity classification at the exact 4%/8%/15% thresholds, correct side selection across home/draw/away, multi-market `matchLabel` handling, momentum score clamping to 0-100, signal settlement for both the 1X2 market (home/away/draw) and the Over/Under totals market (including matchId-suffix resolution back to the base fixture, in both the live and replay settlement paths), the API key middleware's fail-closed behavior, the Supabase persistence service's fail-open behavior against a mocked client, the market maker's spread/reliability model, the Arena's Momentum Follower/Contrarian/Kelly Criterion position logic (including risk-limit rejection) and variable-stake ROI math, the retroactive backtest orchestration against archived signals, the scores-context freshness gate and its graduated tightness companion, the insert-only archive's fail-open behavior on both write and read, the archive read endpoint's query-param parsing/clamping, the Outcome Audit council's dissent computation/aggregation, the feed health module's cycle/odds/coverage checks and status derivation, the market maker band-breach cross-check/summary, the steam detection module's tick-sequence/window/trailing-run logic, the signal correlation module's deduplicated session-windowing/cluster-filtering logic and its pattern-matched variant, the composite confidence score's weighting/renormalization and longshot penalty, the signal-type performance aggregation, the historical pattern match's similarity ranking and match-concentration cap, the event-latency aggregation, the shared SSE stream monitor's connect/reconnect/backoff/status-derivation logic, and the live-poll rotation's confirmed-finished-fixture filtering.

Pure logic gets unit tests with plain objects/mocks; anything requiring a real TxLINE/Supabase connection is not automated. `tsconfig.json` excludes `src/**/*.test.ts` so test files never ship in the production build output.

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

Do not commit .env.local, .secrets, or API tokens. Only .env.example (a template with no real values) is tracked.

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
- GET /api/arena (Momentum Follower vs Contrarian vs Kelly Criterion scoreboards, SHA-256 tamper-evident ledger hash)
- GET /api/arena/backtest (retroactive Momentum Follower/Kelly Criterion backtest against the full archive)
- GET /api/archive (paginated, filterable read over the permanent signal archive)
- GET /api/feed-health (cycle health, odds freshness, fixture coverage diagnostic)
- GET /api/market-maker/confirmations (band-breach cross-check against each signal's own severity)
- GET /api/steam-moves (sustained same-direction tick-sequence detection)
- GET /api/signal-correlation (cross-match signal cluster detection)
- GET /api/signal-correlation/patterns (pattern-matched cross-match clusters: same side/severity/market repeating across matches)
- GET /api/signal-performance (historical hit-rate per signal type)
- GET /api/signal-performance/by-confidence (accuracy bucketed by composite confidence score)
- GET /api/signal-performance/event-latency (event-to-market reaction latency stats per severity tier)
- GET /api/archive/similar-signals (nearest-neighbor similar past signals for a given target signal)
- GET /api/metrics (uptime, decision latency, stream staleness, duplicate-drop counters)
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- GET /api/docs (interactive Swagger UI documenting every endpoint)
- POST /api/agent/run-once (requires X-API-Key header, rate-limited 10/min)

## Known Limitations (Documented, Not Yet Fixed)

- **Exact 60,000ms scores-context freshness boundary is untested** (only 59s/61s either side are tested). Low-risk.
- **Single-source odds, not multi-bookmaker consensus** — TxLINE's feed is already blended/de-vigged at the source before reaching this API; features premised on comparing multiple bookmakers do not apply to this data source. See `README.md`'s "Current Limitations" for the full, current list (also covers persistence semantics, free-tier hosting, and tournament-bounded live validation).

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
