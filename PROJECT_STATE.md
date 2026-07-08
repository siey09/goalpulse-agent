# GoalPulse Agent — Project State

**As of:** 2026-07-08. This document is a session-handoff brief — read this
first, before `README.md`/`TECHNICAL_DOCS.md`/`SUBMISSION_NOTES.md` (which are
judge/submission-facing and slightly stale relative to this file as of this
writing — they predate the three features this document adds in the
"This Session" section below). If a claim here ever conflicts with the actual
code, trust the code and treat this file as needing an update, not the other
way around.

## ⏸ SESSION HANDOFF (updated after every milestone — see status below)

Working through a 10-item feature queue, each via brainstorm → spec → plan →
**Inline Execution** (standing user preference, not subagent-driven) →
end-of-task check-in (diff + test + build) → user says "proceed"/"push" →
merge to `main` → push → clean up worktree.

✅ Done: #1 archive read endpoint, #2 Outcome Audit dissent detail, #3 feed
health monitoring, #4 Market Maker double-confirmation cross-check, #5
steam move detection, #6 signal correlation, #7 composite confidence score,
#8 Arena third strategy (Kelly Criterion), #9 retroactive backtesting
against the archive — all merged and pushed to `main` (161 tests, 23 routes).
#10 real-time push effort/benefit assessment — written up, no code change
(assessment-only deliverable); recommendation is **do not build now**
(backend's own 3-5s agent cycle already bounds real-world freshness, so
push wouldn't visibly help; this session was explicitly backend-only, not
frontend/UX; real remaining risk given the 2026-07-19 deadline). Assessment:
`docs/superpowers/specs/2026-07-08-realtime-push-assessment.md`.

**10-item feature queue is complete.** New phase started 2026-07-08 per
explicit user instruction: close out remaining setup work, then prioritize
judge-facing demo completeness over further backend depth, given the
July 19 deadline and the tournament narrowing to ~4 matches after July 11.

🔄 In Progress: none — Signal Archive dashboard panel merged and pushed to
`main`. **Not yet visually verified in a browser** (no browser automation
tool was available this session) — verified instead via clean build and
direct API-shape testing against production. Recommend a quick visual
check before treating it as fully confirmed.

📋 Next Steps: reassess remaining priorities (stale-finished-match
repolling fix, orphaned worktree cleanup) against time left before
July 19.

**Environment notes:** stray leftover dev-server processes accumulate on
this machine across sessions — verify a PID's command line before
using/killing it, prefer an alternate port. Worktree removal can fail with
"Device or resource busy" — kill the exact leftover PID first, then retry.
`.claude/worktrees/agent-arena` is in active use by a different Claude Code
session — do not touch it.

## What this project is

GoalPulse Agent is an autonomous TxLINE-powered sports market intelligence
system, built for a hackathon (TxLINE Trading Tools and Agents track,
**deadline 2026-07-19**). It watches live World Cup odds, detects meaningful
odds movement, enriches it with real match-event context, audits signals
against real final scores, and runs three synthetic "trading agents"
head-to-head on the same signal feed. It is explicitly
analytics-only: no wagers placed, no funds moved, no smart contract executed.

**Tournament context that matters for prioritization:** the World Cup is
narrowing sharply — only ~4 matches remain after 2026-07-11, then the final
on 2026-07-19. This is *why* the signal-archive feature (see below) exists:
without it, most already-generated signals would simply disappear as matches
and their odds history age out of in-memory caps and TxLINE's own live
rotation window, before the tournament even ends.

## Deployment (current, live)

- **Frontend:** Vercel — https://goalpulse-agent.vercel.app
- **Backend:** Render — https://goalpulse-agent-api.onrender.com
- **Health check:** https://goalpulse-agent-api.onrender.com/health
- **Repository:** https://github.com/siey09/goalpulse-agent, `main` branch
- **Git state right now:** `main` and `origin/main` are both at `26857ad`,
  fully in sync. No open feature branches, no uncommitted changes (one
  harmless untracked file, `docs/superpowers/plans/2026-07-07-agent-arena-plan.md`
  — a duplicate of already-committed content, safe to ignore or delete).
- **Render auto-deploy has historically lagged behind pushes to `main` by
  a nontrivial amount** — confirmed directly in production during this
  session (see "Deploy-lag incident" below). Don't assume a push is live
  within minutes; verify against real endpoint behavior if it matters.

### Environment variables (Render backend)

- `PORT`, `AGENT_INTERVAL_MS=5000`, `USE_SIMULATED_FEED=false`
- `TXLINE_API_BASE_URL`, `TXLINE_API_TOKEN`/`TXLINE_API_KEY`
- `SOLANA_WALLET_SECRET_KEY` (enables real on-chain validation), `SOLANA_RPC_URL` (optional)
- `DISCORD_WEBHOOK_URL` (optional, HIGH-severity alerts)
- `API_ACCESS_KEY` (protects `POST /api/agent/run-once`, fail-closed)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (enable both Supabase features below, fail-open if unset)
- `VITE_API_BASE_URL` (frontend build-time, points at the Render backend)

Never commit `.env.local`/`.secrets`/real tokens — audited clean historically,
only `.env.example` (template, no real values) is tracked.

## Architecture

Four layers: TxLINE feed ingestion → TXODDS Scores enrichment → autonomous
signal engine → React dashboard.

**Backend** (`apps/api/src/`, Node/Express/TypeScript):
- `server.ts` — all routes, agent-cycle scheduling
- `agent.ts` — `processAgentCycle()`, the autonomous loop; now also exports
  two small pure helpers (`findPendingSignals`, `findNewlySettledSignals`)
  added this session
- `store.ts` — in-memory state (`matches`, `recentFinishedMatches`,
  `oddsSnapshots` capped 800, `signals` capped 100, `agentRuns` capped 50);
  settlement logic (`evaluatePendingSignalsForFinishedMatches`) lives here
- `logic/` — pure, independently-testable modules: `signalEngine.ts`,
  `marketMaker.ts`, `arena.ts`, `scoresContextFreshness.ts`,
  `councilDissent.ts`, `feedHealth.ts`, `marketConfirmation.ts`,
  `paginationParams.ts`, `steamDetection.ts`, `signalCorrelation.ts`
- `services/` — external integrations: `txlineClient.ts` (the real TxLINE
  API client), `txlineStream.ts` (push-stream monitor), `onchainValidation.ts`
  (Solana), `alerts.ts` (Discord), `persistence.ts` (Supabase snapshot
  recovery), `archive.ts` (Supabase permanent archive, read + write)
- `middleware/` — `apiKeyAuth.ts`, `rateLimiters.ts`

**Confirmed fact about the odds feed (2026-07-08, via TxLINE's official
docs at txline.txodds.com/documentation/odds/overview):** TxLINE's odds
feed is powered by "Stable Price," TxODDS' consensus pricing engine — lines
across global operators are already blended into a single price before
reaching this API. `evidence.bookmaker` is effectively a single consensus
value, **not** genuine multi-bookmaker data. Any future feature idea
premised on "compare multiple books/lines" needs to account for this —
don't re-investigate, this is settled.

**Frontend** (`apps/web/src/`, React/TypeScript/Vite/Tailwind): `App.tsx` plus
`components/` — `SignalIntelligencePanel`, `MarketMakerPanel`, `ArenaPanel`,
`ResultsSettlementPanel`, `SignalArchivePanel` (new), `VerifiedCaseStudiesPanel`,
`WhatChangedPanel`. No test runner configured — every panel is verified
manually against a running dev server, not via automated tests.

**Docs conventions this session established** (follow these for any future
work): `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` (brainstormed,
approved design specs) and `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
(TDD-style implementation plans, executed via subagent-driven-development —
fresh subagent per task, task-level review, then a final whole-branch review
before merge). Every feature this session followed this exact pipeline:
brainstorm → spec → plan → implement (per task, reviewed) → final review →
merge to `main` → push. Continue this pattern for new work.

## Complete feature list

### Pre-existing (before this session — see `TECHNICAL_DOCS.md`/`SUBMISSION_NOTES.md` for full detail)

- Core signal engine: odds-compression detection (LOW ≥4%, MEDIUM ≥8%, HIGH
  ≥15%), TXODDS Scores enrichment, field pressure index, reliability filter
- Final-score audit / settlement (`evaluatePendingSignalsForFinishedMatches`)
- Outcome Audit Layer: 3-agent council vote, Smart Money Trap classification,
  SHA-256 proof hash (`GET /api/replay/backtest`)
- Live TxLINE push-stream monitor (`txlineStream.ts`, additive to polling)
- Real on-chain Merkle proof validation against TxLINE's `Txoracle` Solana
  mainnet program (`GET /api/onchain/validate-stat`)
- Simulated P&L / trading performance (`GET /api/pnl`)
- Autonomous Discord alerts on HIGH severity signals
- Multi-market signal detection (1X2 + Over/Under totals, isolated matchIds)
- API key auth on the one mutating endpoint (`POST /api/agent/run-once`)
- Rate limiting (1200/min general, 10/min on the mutating endpoint;
  `trust proxy = 2`, confirmed against real Render/Cloudflare log evidence)
- Interactive OpenAPI/Swagger docs (`GET /api/docs`)
- **Supabase periodic-snapshot persistence** (`persistence.ts`,
  `store_snapshots` table) — single-row, upserted every 30s, restart
  recovery only, verified surviving a real Render restart
- Pinned case studies (frontend-bundled, restart-immune) + small-sample
  disclaimer
- In-Play Market Maker (`marketMaker.ts`, `GET /api/market-maker`,
  `MarketMakerPanel.tsx`)

### This session (2026-07-07 to 2026-07-08)

**1. Agent vs Agent Arena** (`logic/arena.ts`, `GET /api/arena`,
`ArenaPanel.tsx`) — two synthetic agents on the same live 1X2 signal feed
with genuinely opposite strategies: **Momentum Follower** takes every signal
at face value; **Contrarian** fades signals with `fieldPressureScore < 22`
(the exact threshold `SignalIntelligencePanel.tsx` already uses for
"MARKET-ONLY MOVE"), taking the opposite side at the real quoted price from
the original snapshot. Settlement is tamper-evident (SHA-256 hash of both
ledgers) and points at the existing `GET /api/onchain/validate-stat` for
on-chain verification of the underlying data — zero new on-chain code.
Computed live at request time; never touches `agent.ts`/`store.ts`'s mutable
state. Spec: `docs/superpowers/specs/2026-07-07-agent-arena-design.md`.

**2. Scores-context freshness fix** (real bug, found and fixed) — see "Bugs
found and fixed" below. Spec (with two amendment rounds documenting the full
investigation):
`docs/superpowers/specs/2026-07-07-scores-context-freshness-design.md`.

**3. Insert-only signal archive** (`services/archive.ts`, `signal_archive`
Supabase table) — appends a permanent, growing record of every signal at
creation and again at settlement, immune to the in-memory store's caps and
to TxLINE's live-rotation window. Deliberately separate from and never
touching the existing `persistence.ts`/`store_snapshots` (that one is a
restart-recovery snapshot; this one is a permanent history). Spec:
`docs/superpowers/specs/2026-07-07-signal-archive-design.md`.

**4. Signal archive read endpoint** (`GET /api/archive`) — paginated
(`page`/`pageSize`, default 25 capped at 100), filterable
(`matchId`/`status`/`market`/`event`) read endpoint over `signal_archive`.
Returns raw event-log rows (a signal usually appears twice: `created` and
`settled`), never collapsed. `market` is inferred from `matchId` containing
`-totals-` (no schema change). Fail-open: returns `200` with empty
data/`totalCount: 0` if Supabase is unconfigured or the query fails, never an
error. No dashboard panel yet (deliberately deferred, see "What's left").
Spec: `docs/superpowers/specs/2026-07-08-archive-read-endpoint-design.md`,
plan: `docs/superpowers/plans/2026-07-08-archive-read-endpoint.md`.

**5. Outcome Audit dissenting-vote detail** (`logic/councilDissent.ts`,
`GET /api/replay/backtest`) — each `councilVotes[]` entry now includes
`unanimous` (true only when all 3 agents approved — the only symmetric
consensus state possible, since only the Movement Detector can literally
vote "reject") and `dissentingAgents` (which agent(s) didn't approve). The
response's `summary.councilDissent` aggregates this across the run:
`unanimousSignals`, `dissentingSignals`, `dissentRatePct`,
`dissentByAgent` (every agent's dissent count, including agents who never
dissent, at 0). Backend-only (frontend's council panel still only renders
`councilVotes[0]` — separate, pre-existing gap, not addressed). Covered by
the same tamper-evident SHA-256 proof hash as the rest of the audit. Spec:
`docs/superpowers/specs/2026-07-08-council-dissent-detail-design.md`, plan:
`docs/superpowers/plans/2026-07-08-council-dissent-detail.md`.

**6. Feed health / data-quality monitoring** (`logic/feedHealth.ts`,
`GET /api/feed-health`) — three independent checks, separate from
match-odds signals and from `GET /health`'s liveness probe: **cycle
health** (a gap over 3x `config.agentIntervalMs`, either right now or
between two historical runs, is flagged), **odds freshness** (a live
match's most recent odds snapshot going quiet for over 5 minutes — not the
match's own `lastUpdated`, which can't actually go stale given how
`store.matches` is wholesale-replaced every cycle), and **fixture
coverage** (a new `AgentRun.rawFixtureCount` field compared against
`matchesProcessed` detects when the existing 14-fixture-per-cycle cap
silently dropped coverage). Status is `"down"` if the current cycle gap is
exceeded, `"degraded"` if any historical missed cycle/stale match/coverage
drop exists, `"healthy"` otherwise. Backend-only, no dashboard panel. Spec:
`docs/superpowers/specs/2026-07-08-feed-health-monitoring-design.md`, plan:
`docs/superpowers/plans/2026-07-08-feed-health-monitoring.md`.

**7. Market Maker double-confirmation cross-check** (`logic/marketConfirmation.ts`,
`GET /api/market-maker/confirmations`) — found and fixed a real circularity
problem during design: a naive cross-check between the Market Maker's
spread and the signal engine's severity would agree by construction, since
both pull from the same `fieldPressureScore`/`reliability` fields on the
same snapshot. Instead computes what the Market Maker would have quoted
using the snapshot from **before** the move, then checks whether the
signal's actual post-move odds broke below that old quote's bid for the
signal's side — genuine, non-circular corroboration. Applies to both 1X2
and totals signals. Backend-only, no dashboard panel. Spec:
`docs/superpowers/specs/2026-07-08-market-maker-confirmation-design.md`,
plan: `docs/superpowers/plans/2026-07-08-market-maker-confirmation.md`.

**8. Steam move detection** (`logic/steamDetection.ts`, `GET /api/steam-moves`)
— redefined from the original cross-book framing after confirming (via
TxLINE's official docs) the feed is Stable Price consensus pricing, not
multi-bookmaker data (see Architecture section above). Detects a trailing
run of 3+ consecutive same-direction odds ticks, each ≥1% compression,
spanning ≤5 minutes — distinct from the core signal engine, which only
ever compares exactly two snapshots. Checks home side first, then away;
`matchId`/`match` display fields come directly from the snapshots
themselves (no separate `Match` lookup, sidestepping the totals-matchId
suffix problem). Applies to both 1X2 and totals lines. Backend-only, no
dashboard panel. Spec: `docs/superpowers/specs/2026-07-08-steam-move-detection-design.md`,
plan: `docs/superpowers/plans/2026-07-08-steam-move-detection.md`.

**9. Signal correlation across simultaneous matches** (`logic/signalCorrelation.ts`,
`GET /api/signal-correlation`) — detects signals firing across 2+ distinct
matches close together in time, a pattern the core signal engine (which
only ever reasons about one match) has no visibility into. Groups the
*entire* stored signal history via session-windowing (a new group starts
whenever the gap to the previous signal exceeds 5 minutes, so a steady
trickle can span longer than 5 minutes total); only groups spanning 2+
distinct `matchId`s are reported. No severity/type filtering to join a
cluster — each cluster reports a `severityBreakdown` instead. Backend-only,
no dashboard panel. Spec: `docs/superpowers/specs/2026-07-08-signal-correlation-design.md`,
plan: `docs/superpowers/plans/2026-07-08-signal-correlation.md`.

**10. Composite confidence score + signal-type performance**
(`logic/signalEngine.ts`'s `calculateConfidenceScore`,
`logic/signalPerformance.ts`, `GET /api/signal-performance`) — split into
two pieces after finding a real architectural tension: historical hit-rate
needs an async Supabase query, which would introduce latency/complexity
into the one piece of core pipeline code that's stayed fully synchronous
all session. New `AgentSignal.confidenceScore?` (0-100, optional — matches
the existing `discordAlertStatus?` precedent) blends magnitude (weight
0.5, vs. the 15% HIGH threshold), field pressure (weight 0.3, vs.
`marketMaker.ts`'s `FIELD_PRESSURE_MAX`, now exported), and a new graduated
freshness-tightness measure (weight 0.2, `computeFreshnessTightness` in
`scoresContextFreshness.ts`) — weights renormalize when `scoresContext` is
absent, so missing context never lowers the score. `severity`/
`momentumScore` are unchanged. Historical hit-rate is a separate,
async, archive-backed endpoint reading the 500 most recent settled
archive entries, grouped by `signalType`. Backend-only, no dashboard
panel. Spec: `docs/superpowers/specs/2026-07-08-composite-confidence-score-design.md`,
plan: `docs/superpowers/plans/2026-07-08-composite-confidence-score.md`.

**11. Arena third strategy: Kelly Criterion** (`logic/arena.ts`'s
`calculateKellyStake`/`buildKellyCriterionPosition`, `GET /api/arena`) —
Momentum Follower/Contrarian both stake a flat 1 unit, differing only in
side, never sizing; Kelly takes the *same* side as the signal but varies
its stake via the Kelly formula, a genuinely different mechanism (chosen
over a "Sharp-Only" filter, which would've just been a filter on the same
flat-staking mechanism). Since `confidenceScore` isn't a literal win
probability, it scales an assumed edge over the market's own implied
probability (`1/oddsTaken`), capped at `MAX_EDGE = 0.15`; the raw Kelly
fraction is capped at `MAX_STAKE_FRACTION = 0.2` then scaled by
`KELLY_BANKROLL_UNITS = 10`. At `confidenceScore = 0` the fraction is
exactly 0 for any odds — an algebraic property, not an approximation.
Required generalizing `ArenaPosition` with an explicit `stakeUnits` field
across all three agents (`settleStake` replacing `settleUnit`) so
`roiPercent` divides by the *sum of actual stakes*, not
`settledCount * 1` — 100% behavior-preserving for the first two agents
since their stake is always exactly 1. Found during design: negating a
stake must be written as `0 - stakeUnits`, not `-stakeUnits`, so a
legitimately-zero Kelly stake settles to `+0` not `-0`
(`Object.is(-0, 0)` is `false`, which Vitest's `toBe()` uses). Backend-only,
no dashboard panel. Spec: `docs/superpowers/specs/2026-07-08-arena-kelly-criterion-design.md`,
plan: `docs/superpowers/plans/2026-07-08-arena-kelly-criterion.md`.

**12. Retroactive Arena backtesting against the archive**
(`logic/backtest.ts`'s `computeBacktestScoreboards`,
`GET /api/arena/backtest`) — replays Momentum Follower and Kelly Criterion
against the 500 most recent settled archive entries, rather than the live
`GET /api/arena`'s capped-100, in-memory `store.signals`. Both agents need
only fields already on the archived signal itself, so this reuses their
existing builder functions plus `arena.ts`'s own `summarize` (exported for
this purpose) with zero duplicated logic. **Contrarian is deliberately
excluded**: resolving its opposing-side outcome needs the real match final
score (a signal's own `resultStatus === "incorrect"` is ambiguous between
"opponent won" and "draw"), and neither the archive nor the archived
signal ever captures it. Extending the archive schema to add it was
considered and rejected — confirmed with the user — since it would only
help newly-archived signals going forward. The route is named
`/api/arena/backtest`, not `/api/backtest`, to stay distinct from the
pre-existing, unrelated `GET /api/replay/backtest` (single-signal council
vote replay). Backend-only, no dashboard panel. Spec:
`docs/superpowers/specs/2026-07-08-arena-archive-backtest-design.md`,
plan: `docs/superpowers/plans/2026-07-08-arena-archive-backtest.md`.

## Bugs found and fixed

**Pre-existing** (full detail in `TECHNICAL_DOCS.md`'s "Known Issues Fixed"):
undocumented `StatusId 100` not treated as finished; snapshot-ordering during
historical backfill (fixed in `agent.ts` by requiring the previous snapshot
be strictly chronologically older); live fixture coverage silently dropped
past a 14-fixture-per-cycle cap (fixed by prioritizing in-play fixtures
before slicing).

**This session — the scores-context freshness bug**, found while verifying
an Arena result (Momentum Follower 18/18 losses on USA vs Belgium — that
specific result was itself confirmed *correct*, a real 1-4 loss, not a bug).
The real bug: `fetchTxLineFeed()`/`fetchRecentTxLineResults()` in
`txlineClient.ts` each compute one `scoresContext` per poll and stamped it
onto *every* odds tick selected that poll — including ticks
`selectMovementOdds` reaches far back in history for (it always includes the
single strongest historical compression pair, regardless of recency). A
reached-back tick could get labeled with a `scoresContext` reflecting a much
later real-world moment, mislabeling `fieldPressureScore` — which is exactly
what Arena's Contrarian agent uses to decide whether to fade a signal.

Fixed in two layers, both merged:
- **Snapshot layer** (`services/txlineClient.ts`, three call sites): new
  `isScoresContextFresh(tickTs, contextTimestamp, toleranceMs)` in a shared
  `logic/scoresContextFreshness.ts` module, gating with a 60-second
  tolerance derived from real gap measurements on the actual anomalous
  match (clean separation: normal jitter maxed at 48.2s, the two real
  violations were 128.9s/302.0s).
- **Signal layer** (`logic/signalEngine.ts`): a *second*, narrower gap found
  during Task 1's own final review — `buildSignalFromSnapshots`'s
  `current.evidence?.scoresContext ?? previous.evidence?.scoresContext`
  fallback was never checked against `current`'s own timestamp (only ever
  implicitly against `previous`'s, and only became reachable at all once the
  snapshot-layer fix started producing `undefined` values). Fixed by gating
  the fallback the same way, checked against `current`'s timestamp.
- **Post-merge fix**: the branch's own final review found `signal_data` in
  the *archive* feature (see below) stored a live object reference, not a
  point-in-time snapshot — fixed with a shallow copy at archive-call time.

**Deploy-lag incident (not a code bug, but worth knowing):** while verifying
this fix's live behavior, found the exact original bug still reproducing in
production *after* the fix had been merged and pushed — traced precisely by
scanning the full current signal store: every one of ~99 signals spanning an
11.5-hour window showed the old violation pattern, then the single most
recent signal showed correct gating. Render's deploy had simply lagged well
behind the git push. Resolved itself; no code issue. Lesson: verify against
live endpoint behavior, don't assume a push is live.

## Known limitations (documented, deliberately not fixed)

- **Stale-finished-match repolling.** A long-finished fixture (confirmed:
  USA vs Belgium, hours after full-time) can still be included in
  `fetchTxLineFeed()`'s live poll rotation. `selectMovementOdds` re-selects
  the single strongest historical compression pair on every poll regardless
  of recency, so the same old tick keeps getting resubmitted. Once its
  `OddsSnapshot` ages out of the shared 800-entry cache and more than
  `signalAlreadyExists`'s 6-hour dedup window has passed, a "new"
  `AgentSignal` gets created for the exact same historical tick — with a
  fresh `createdAt` and a freshly-fetched `scoresContext`. Not a bug in the
  freshness fix (which correctly gates the mismatched context in this
  scenario); it's a separate, pre-existing characteristic of the
  live-polling/dedup design. Documented in
  `docs/superpowers/specs/2026-07-07-scores-context-freshness-design.md`'s
  Follow-ups. Worth fixing later (e.g., drop long-finished fixtures from the
  live rotation, or tighten the dedup window) — not attempted this session.
- **Signals that age out of the 100-cap before their match finishes never
  get a "settled" archive row.** Pre-existing store behavior (not introduced
  by the archive feature) — the archive will contain some permanently
  `"pending"`/unverified entries. Don't assume every archived signal has a
  matching settled counterpart.
- **Future-call-site risk in the freshness gate.** The gate lives at the
  three `txlineClient.ts` call sites, not inside
  `normalizeOddsSnapshot`/`normalizeTotalsSnapshot` themselves — a
  hypothetical fourth call site that skips the gate would silently reopen
  the original bug. Flagged by the final reviewer as the one thing worth
  hardening if this area is touched again; not urgent.
- **Exact 60,000ms freshness boundary is untested** (only 59s/61s either
  side are tested). Low-risk, noted twice by reviewers, never acted on.

## Testing

**161 tests across 17 files**, all passing, `npm run test` from `apps/api/`:
`agent.test.ts`, `logic/arena.test.ts`, `logic/backtest.test.ts`,
`logic/councilDissent.test.ts`, `logic/feedHealth.test.ts`,
`logic/marketConfirmation.test.ts`, `logic/marketMaker.test.ts`,
`logic/paginationParams.test.ts`, `logic/scoresContextFreshness.test.ts`,
`logic/signalCorrelation.test.ts`, `logic/signalEngine.test.ts`,
`logic/signalPerformance.test.ts`, `logic/steamDetection.test.ts`,
`middleware/apiKeyAuth.test.ts`, `services/archive.test.ts`,
`services/persistence.test.ts`, `store.test.ts`.
Build: `npm run build` (`tsc`), currently clean. Convention: pure logic gets
unit tests with plain objects/mocks; anything requiring a real
TxLINE/Supabase connection is explicitly *not* automated (this environment
has no real credentials for either) — verified instead by the user directly
against production.

**23 backend routes total**, all documented in `openapi.yaml` (validate with
`npx @redocly/cli lint openapi.yaml`): `/health`, `/api/matches`,
`/api/signals`, `/api/stats`, `/api/pnl`, `/api/agent-runs`,
`/api/odds-history`, `/api/recent-results`, `/api/market-maker`,
`/api/arena`, `/api/arena/backtest`, `/api/archive`, `/api/feed-health`,
`/api/market-maker/confirmations`, `/api/steam-moves`,
`/api/signal-correlation`, `/api/signal-performance`,
`/api/replay/backtest`, `/api/onchain/validate-stat`,
`/api/live/odds-stream`, `/api/live/replay-stream`, `/api/docs`,
`POST /api/agent/run-once`.

## What still needs doing

1. ~~Run the `signal_archive` SQL against Supabase~~ **Already done** —
   confirmed 2026-07-08 by querying production `GET /api/archive` directly:
   247 real entries, spanning 2026-07-07T19:45Z through today, including
   `confidenceScore` (a later-session field), proving the table has been
   live and accumulating correctly since before this check. This "still
   needs doing" note was stale.
2. ~~Signal archive dashboard panel~~ **Done (2026-07-08)** —
   `apps/web/src/components/SignalArchivePanel.tsx`, the session's first
   actual frontend feature. Paginated (Prev/Next), filterable (matchId
   search debounced 400ms; status/market/event pill toggles), defaults
   `event` to `settled` so a signal never visibly appears twice. Verified
   directly against the live production archive (no frontend test runner
   exists in `apps/web`). Spec:
   `docs/superpowers/specs/2026-07-08-signal-archive-panel-design.md`,
   plan: `docs/superpowers/plans/2026-07-08-signal-archive-panel.md`.
3. **`match_archive` table** (deliberately deferred): match-level permanent
   history, if ever needed beyond what's already captured inside each
   archived signal's `signal_data` blob.
4. **Stale-finished-match repolling fix** (see "Known limitations" above) —
   not urgent, but a real, identified gap worth closing before the July 19
   final if there's time.
5. **Cosmetic:** two orphaned worktree directories under
   `.claude/worktrees/` (from the Arena and signal-archive features) hit a
   transient Windows file-lock during cleanup and were left on disk,
   deregistered from git but not physically deleted. Harmless; delete
   manually whenever convenient.
6. No new Supabase project, no new hosting — both features this session
   reuse the existing free-tier Supabase project and Render/Vercel
   deployments already configured.

## If you're a fresh session picking this up

- Read this file first. Then, if you need deeper pre-session detail, read
  `TECHNICAL_DOCS.md` (architecture/feature detail) and `SUBMISSION_NOTES.md`
  (narrative/verification evidence) — both otherwise complete and accurate,
  just missing this session's three additions (now covered above).
- For any new feature or bugfix: use `/brainstorm` first (design spec →
  implementation plan → subagent-driven-development), matching this
  session's established pattern exactly. Don't skip straight to code.
- For any investigation of "why does this data look wrong," check the live
  production API directly (`https://goalpulse-agent-api.onrender.com`)
  before assuming the deployed code matches what's in `main` — deploys have
  lagged before (see "Deploy-lag incident").
- This repo is a shared, live, deployed system — treat any git branch/worktree
  operations with the same care already established this session (isolate in
  a worktree, never force-push, confirm before destructive actions).
