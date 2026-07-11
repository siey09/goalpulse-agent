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

`GET /api/arena` runs three synthetic trading agents head-to-head on the same live 1X2 signal feed with genuinely different strategies, computed live at request time and never touching the mutable agent/store state: **Momentum Follower** takes every signal at face value; **Contrarian** fades signals it classifies as market-only moves (reusing the exact `fieldPressureScore < 22` threshold the dashboard already labels "MARKET-ONLY MOVE"), taking the opposite side at the real quoted price from the original odds snapshot; **Kelly Criterion** takes the same side as the signal but sizes its stake via the Kelly formula, deriving an implied edge from the signal's confidence score blended with the market's own implied probability. Settlement is tamper-evident — a SHA-256 hash of all three ledgers — and the underlying data can be independently verified via the existing on-chain Merkle proof endpoint, with zero new on-chain code required.

### 2. Insert-Only Signal Archive

Every signal is now appended to a permanent Supabase table (`signal_archive`) at creation and again at settlement, deliberately separate from and never touching the existing restart-recovery snapshot table. This matters specifically for this tournament: the World Cup narrows sharply after 2026-07-11 to just a handful of matches before the July 19 final, and without this feature, most already-generated signals would simply disappear as matches and their odds history age out of the in-memory store's caps and TxLINE's own live-rotation window before the tournament even ends. Readable via `GET /api/archive` (see below), and now visible on the dashboard too (see "Signal Archive Dashboard Panel" below) once real data had accumulated for a day.

### 3. Signal Archive Read Endpoint

`GET /api/archive` makes the accumulating archive actually queryable — previously the only way to inspect it was browsing the Supabase table directly. Paginated (`page`/`pageSize`, default 25 capped at 100) and filterable (`matchId`/`status`/`market`/`event`). Returns raw event-log rows rather than a collapsed per-signal view, since the table is insert-only by design: a signal usually has both a `created` and a `settled` row, and a caller filtering `event=settled` gets only final outcomes. The `market` filter (`1x2`/`totals`) is inferred from `matchId` containing `-totals-`, reusing the existing multi-market convention with no schema change. Fail-open like the rest of this feature: returns `200` with an empty page instead of an error if Supabase is unconfigured or unreachable.

### 4. Scores-Context Freshness Fix (Real Bug, Found and Fixed)

Found while verifying an Arena result. A single TXODDS Scores context is computed once per poll and was being stamped onto every odds tick selected that poll — including ticks reached far back in history (the signal engine always includes the single strongest historical compression pair, regardless of recency). A reached-back tick could get labeled with a `scoresContext` reflecting a much later real-world moment, mislabeling `fieldPressureScore` — exactly the value Arena's Contrarian agent uses to decide whether to fade a signal. Fixed with a 60-second freshness gate (derived from real gap measurements: normal jitter maxed at 48.2s, the two real violations were 128.9s/302.0s) at both the snapshot layer (`txlineClient.ts`, three call sites) and a second, narrower gap found during review in the signal layer's historical-context fallback (`signalEngine.ts`).

**Deploy-lag note:** while verifying this fix live, the original bug was still reproducing in production after the fix had been merged and pushed — traced to every one of ~99 signals across an 11.5-hour window showing the old pattern, then the single most recent signal showing correct gating. Render's deploy had simply lagged behind the git push; it resolved itself with no further code changes. Lesson: verify against live endpoint behavior, don't assume a push is live.

### 5. Feed Health / Data-Quality Monitoring

`GET /api/feed-health` reports on feed degradation as its own concern, separate from match-odds signals and from `GET /health`'s fast liveness probe: **cycle health** (is the autonomous agent's polling loop running on schedule — a gap over 3x the expected interval, either right now or historically, is flagged), **odds freshness** (has any live match's odds feed gone quiet for over 5 minutes — checked against the match's most recent odds snapshot, not its own timestamp, since a `Match` can't actually sit stale in the store the way an odds snapshot can), and **fixture coverage** (did the live poll loop's existing 14-fixture-per-cycle cap silently drop coverage this cycle — a new `rawFixtureCount` field on `AgentRun` makes this comparable against the already-tracked processed count for the first time). This directly protects against a repeat of two things already found this session: the stale-finished-match-repolling known limitation and the deploy-lag incident above, both of which previously required manually scanning the signal store to notice.

### 6. Market Maker Double-Confirmation Cross-Check

`GET /api/market-maker/confirmations` cross-checks every stored signal against a genuinely independent test, after finding a real circularity problem during design: the Market Maker's spread and the signal engine's momentum score both already pull from the same `fieldPressureScore`/`reliability` fields on the same snapshot, so directly comparing them would just agree by construction. Instead, it computes what the Market Maker *would have quoted* using the snapshot from before the move, then checks whether the signal's actual post-move odds broke below that old quote's bid for the signal's side — a move that outpaced the market's own prior uncertainty allowance, using data neither model currently uses for this purpose. Reports both per-signal results and an aggregate confirmation rate across the run.

### 7. Steam Move Detection

The original idea was cross-book steam detection ("odds moving the same direction across multiple books"). Verified against TxLINE's official documentation: TxLINE's odds feed is powered by "Stable Price," TxODDS' own consensus pricing engine — lines from global operators are already blended into a single price before reaching this API, so genuine multi-bookmaker comparison isn't buildable with real data here. Redefined for what the feed actually provides: `GET /api/steam-moves` detects sustained same-direction pressure across a *sequence* of consecutive ticks (3+ consecutive moves, each at least 1% compression, within a 5-minute window) — distinct from the core signal engine, which only ever compares exactly two snapshots. Applies to both 1X2 and Over/Under totals lines.

### 8. Signal Correlation Across Simultaneous Matches

`GET /api/signal-correlation` detects when signals fire across 2 or more distinct matches close together in time — a cross-match pattern the core signal engine (which only ever reasons about one match at a time) has no visibility into. Groups the entire stored signal history via session-windowing: a new group starts whenever the gap between two consecutive signals exceeds 5 minutes, so a steady trickle of correlated signals can span longer than 5 minutes in total. Only groups spanning 2+ distinct matches are reported; no severity or signal-type filtering is required to join a cluster, and each cluster reports a severity breakdown so significance can be judged directly.

### 9. Composite Confidence Score and Signal-Type Performance

Every signal now carries a `confidenceScore` (0-100), blending compression magnitude (weight 0.5, normalized against the existing 15% HIGH severity threshold), field pressure (weight 0.3), and a new graduated freshness-tightness measure (weight 0.2) — a companion to the existing pass/fail 60-second freshness gate that reports *how* tight the gap actually is, not just whether it passed. Weights renormalize among only the available components when no field context is attached, so a signal is never penalized for missing data it never had a chance to have. Kept entirely separate from `severity`/`momentumScore`, which are unchanged.

Historical hit-rate per signal type (`GET /api/signal-performance`) is a deliberately separate, async piece: computing it requires querying the Supabase archive, which — if baked into the synchronous signal-creation loop — would introduce real latency into the one piece of core pipeline code that's stayed fully synchronous and stable all session. Instead it's its own endpoint, matching every other Supabase-dependent feature this session.

### 10. Arena Third Agent: Kelly Criterion

Momentum Follower and Contrarian both stake a flat 1 unit — they differ only in *which side* they take, never *how much*. The new Kelly Criterion agent takes the same side as the signal but sizes its stake using the Kelly formula, a genuinely different mechanism rather than a threshold variant. Since `confidenceScore` is a quality measure, not a literal win probability, it instead scales an assumed edge over the market's own implied probability (`1/oddsTaken`), capped at 15 percentage points at full confidence — a deliberately conservative choice, since nothing in this system has been backtested to justify assuming a larger edge. The resulting Kelly fraction is capped at 20% of a notional bankroll unit (full Kelly can recommend unrealistically large fractions) and scaled so stakes land in a range comparable to the other two agents' flat bets.

This required generalizing `ArenaPosition` with an explicit `stakeUnits` field across all three agents, since the existing ROI formula silently assumed every position staked exactly 1 unit — true for the first two agents but not once a variable-stake agent exists. A genuine correctness detail turned up during design: negating a stake for a settled-incorrect position needs to be written as `0 - stakeUnits`, not `-stakeUnits` — the latter produces JavaScript's `-0` once a stake can legitimately be exactly zero (a zero-confidence Kelly signal), and `Object.is(-0, 0)` is `false`, which the test framework's equality check uses. The flat-stake agents never surfaced this, since their stake is always exactly 1.

### 11. Retroactive Arena Backtesting Against the Archive

`GET /api/arena/backtest` replays Momentum Follower and Kelly Criterion against the 500 most recent settled entries in the permanent signal archive, rather than the live Arena endpoint's capped-100, in-memory signal feed — showing how these strategies would have performed across the full accumulated history, not just the recent window. Both agents needed nothing beyond fields already present on the archived signal itself, so this reuses their existing builder functions and `arena.ts`'s own aggregation function directly, with zero duplicated logic.

A genuine architectural constraint surfaced during design: **Contrarian cannot be backtested from archived data.** Resolving its opposing-side outcome requires the real match's final score — a signal's own `resultStatus` of `"incorrect"` is ambiguous between "the opponent won" and "the match was a draw" (where the opposing side also loses), and only the actual score disambiguates. Neither the archive table nor the archived signal object ever captures it. Extending the already-shipped, insert-only archive schema to add it was considered and explicitly rejected — it would only help newly-archived signals going forward, leaving existing archived rows still unbacktestable for Contrarian regardless. Rather than silently dropping the third agent, the endpoint surfaces this exclusion directly in its response.

### 12. Signal Archive Dashboard Panel

The session's first actual frontend feature — everything else was backend-only. `apps/web/src/components/SignalArchivePanel.tsx` renders `GET /api/archive` with real pagination and filter controls (match ID search, debounced 400ms since it drives a server query rather than a client-side filter; pill-button toggles for result status, market, and event), the first panel in this codebase to need either. Defaults the `event` filter to `settled` so a signal never visibly appears twice back-to-back (the archive stores raw `created`+`settled` event-log rows under the same signal ID) — a design decision made deliberately, confirmed before implementation, rather than an accident of the data model. Verified directly against the live production archive (247+ real entries) since this environment has no automated frontend test runner, matching how every prior panel in this codebase was verified.

### 13. Pattern-Matched Signal Correlation

A stricter companion to the existing cross-match signal correlation (item 6): `GET /api/signal-correlation/patterns` only reports a cluster when the *same* pattern — direction (`side`), `severity`, and market type (1x2 vs. totals) — repeats across 2 or more distinct matches within the same 5-minute window, rather than any signals firing close together regardless of what they say. Confirmed directly against production data before designing this: the existing correlation feature's real clusters mix severities and markets freely, so a homogeneity filter bolted onto it would rarely fire — this instead partitions signals by pattern key first, then reuses the exact same session-windowing algorithm independently within each partition. That windowing algorithm was extracted out of the original `findSignalClusters` into a shared, generic helper (`sessionWindowGroups`) so both features stay in sync rather than duplicating the same ~15-line loop — regression-tested to confirm the extraction changed zero existing behavior before the new logic was added on top of it.

### 14. Signal Performance Dashboard Panel

The historical hit-rate data from `GET /api/signal-performance` (item 7) had zero dashboard visibility until now — one of several capabilities this session built that existed only as backend routes. `apps/web/src/components/SignalPerformancePanel.tsx` surfaces it directly: one card per signal type, sorted by settled count, color-coded by an accuracy threshold. Confirmed against real production data before shipping: WATCH 88% (52 settled), MOMENTUM_SHIFT 87% (23 settled), SHARP_MOVE only 33% (27 settled) — left fully visible as an honest track record rather than only surfacing favorable numbers.

## Major Features Added 2026-07-10 to 2026-07-11

Beyond the 14 items above, a further round of features closed out the remaining dashboard-visibility gaps, added three new self-audit/discovery capabilities, and closed out a full external technical review (6 "P0" items, a longer P1 list across three risk tiers, a 20-item Mandatory Test Plan, and a 15-item Definition of Done checklist).

**Dashboard visibility for existing backend features**: three panels — Confidence Calibration (`ConfidenceCalibrationPanel.tsx`), Steam Move Detection (`SteamMoveDetectionPanel.tsx`, live-polled every 5s), and Signal Correlation (`SignalCorrelationPanel.tsx`) — gave three previously backend-only capabilities a real dashboard surface, all verified live in production with real data.

**Historical Pattern Match**: `GET /api/archive/similar-signals` finds the archive's most similar past signals to a given target (same `signalType`, ranked by odds-compression and field-pressure distance, capped per other match to avoid one match dominating the result), surfaced in the signal detail modal.

**Verification Depth Score**: a plain-label status badge (never a fabricated percentage) in the Outcome Audit Layer, always the result of a real live Solana on-chain check, never inferred.

**Meta-agent recommendation and Skeptic Check**: `ArenaPanel.tsx` now ranks the three Arena agents by ROI% (not raw net units, which unfairly favored Kelly Criterion's variable staking) with a minimum sample size before declaring a leader, and audits that leader for real match-concentration risk (flagging when ≥50% of its settled sample comes from one real match) — a real, calibrated finding: production data showed the declared leader's settled positions were 100% concentrated in a single match at the time this was built.

**Draw-side signals**: the signal engine now evaluates all three 1X2 outcomes (home/draw/away), not just home/away, end to end through detection, settlement, and the Arena (Contrarian deliberately skips draw signals — no principled "opposite" exists in a three-outcome market).

**Risk-limit rejection**: Kelly Criterion now rejects a paper position outright, with an explicit `risk_limit_exceeded` reason code, when its raw stake sizing exceeds the maximum bankroll fraction — previously it only silently clamped the stake. Verified live in production with real rejections firing.

**Probability-point shift reporting**: signals now report a de-vigged implied-probability-point shift as a genuinely separate number from raw percentage odds compression, reflecting the confirmed fact that TxLINE's feed is already de-vigged at the source.

**Production hardening**: GitHub Actions CI (backend+frontend, parallel jobs), pinned dependency versions, an explicit CORS origin allowlist, an MIT LICENSE, upsert-based idempotency on the permanent archive tables (closing a real restart-timing duplicate-row race found and fixed in production data), and a new `GET /api/metrics` endpoint (uptime, decision latency, stream staleness, duplicate-drop counters).

**Replay-path settlement bugs found and fixed**: the `/api/replay/backtest` route had its own separate, duplicate settlement implementation, missing a draw-outcome branch and unable to resolve a totals signal's matchId back to its real fixture — both fixed by extracting a single shared, tested `logic/replaySettlement.ts` module.

**Full external technical review closed out**: 6 P0 items (2 confirmed false premises given the single-source feed, 2 confirmed already-addressed, 2 confirmed real and fixed — a trap-detection labeling rename to avoid overclaiming certainty), then a full P1 backlog sequenced into three risk tiers (all shipped), then a 20-item Mandatory Test Plan / 15-item Definition of Done audit that found and fixed 4 real gaps (the replay settlement bugs, the risk-limit rejection mechanism, the probability-point-shift reporting, and this document's own staleness). Every item independently verified against real code and live production data, not assumed.

## Bugs Found and Fixed During Live Verification

**Bug 1 — Undocumented StatusId 100.** While verifying production against real matches, the agent could not close out signals for a finished match (Colombia vs Ghana stayed `"live"` at minute 90). Investigation of the raw TxLINE Scores feed showed a `game_finalised` action carrying `StatusId: 100`, a status code not documented in the official TXODDS Scores Product API doc (v1.0, which only lists StatusId 1-18). The status mapping in `txlineClient.ts` was updated to treat `StatusId 100` as `finished`, redeployed, and reverified live: the match correctly flipped to `finished` and both pending signals were immediately evaluated as `correct`, confirmed by the 100% accuracy result above.

**Bug 2 — Snapshot ordering during historical backfill.** After more live verification, 4 signals on a single fixture showed physically implausible odds compression (up to 99% from a single fixed baseline). Root cause: `findPreviousSnapshot()` returned the most recently *stored* snapshot without checking it was chronologically *older* than the new one being processed. When a finished match was re-ingested through the recent-results backfill path, an old pre-match snapshot got compared against an already-stored, much later full-time snapshot as if it were a single live move. Fixed in `agent.ts` by skipping signal generation whenever the candidate previous snapshot is not strictly older than the current snapshot. Reverified live: the bogus signals stopped appearing, and the remaining incorrect signals were legitimate, self-flagged market noise (the system's own "Caution: the latest field event came from the away side" warning correctly caught them in advance).

**Bug 3 — Live fixture coverage could be silently dropped.** The live poll loop processes a capped batch of fixtures per cycle (14, for TxLINE rate/latency reasons) from `/api/fixtures/snapshot`, but the response was not sorted before slicing. With multiple concurrent World Cup matches, a currently in-play fixture could be pushed past the cap by unrelated future-scheduled fixtures, silently dropping live coverage with no error or warning. Fixed by prioritizing fixtures whose kickoff has already passed and are still within a plausible in-play window (kickoff to kickoff + 3 hours) ahead of everything else before slicing.

**Bug 4 — ArenaPanel silently dropped the Kelly Criterion scoreboard (found and fixed 2026-07-10).** `GET /api/arena` had returned all three agent scoreboards (Momentum Follower, Contrarian, Kelly Criterion) since Kelly Criterion shipped, but the dashboard's `ArenaPanel.tsx` only declared the first two in its response type and never rendered the third — a user/judge-facing gap where a fully-working backend feature was invisible on the live site. Fixed by completing the frontend type (`kellyCriterion`, `stakeUnits`, the `kelly_criterion` agent id), adding the missing scoreboard card, and generalizing the leader-detection logic to compare all three agents instead of two.

## Deployment Incidents Found and Fixed

Beyond code bugs, two real production deployment incidents were investigated and resolved — both blocked judges from seeing merged, working features on the live site, with no code changes required.

**Vercel deploy pipeline had no Git connection (2026-07-09).** Merged features (the Signal Archive and Signal Performance dashboard panels) were confirmed present in the `main` branch but absent from the live production frontend. Root cause, confirmed by diffing the deployed JS bundle against from-scratch builds of specific commits: the Vercel project had never been connected to GitHub — every prior deployment was a manual CLI snapshot — so pushes to `main` had nothing wired up to receive them; and once connected, the Root Directory setting needed to be pointed at `apps/web` for the build to find `vite`. Both fixed in the Vercel dashboard. Auto-deploy on push to `main` is now confirmed live going forward.

**Render bandwidth suspension (2026-07-10).** The backend went fully unresponsive. Root cause: the free Hobby workspace's 5GB/month bandwidth allowance was exhausted — driven almost entirely by TxLINE's own outbound service traffic, not by end-user HTTP responses — and Render suspends all free services for the remainder of the calendar month once that happens with no payment method on file. Left unresolved, this would have kept the backend down until August 1, well past the July 19 deadline. Fixed by adding a card to the Render workspace (overage billed at a trivial $0.15/GB); service confirmed restored to "Deployed" and `/health` responding normally.

## Automated Test Coverage and Security Audit

- **276 automated unit tests across 22 files as of 2026-07-11** (Vitest, up from 24 at initial verification; run `npm run test` in `apps/api` for the current count, or check the CI badge in `README.md` for whether `main` currently passes) — cover the deterministic core: signal threshold classification at the exact 4%/8%/15% boundaries, correct side selection across home/draw/away, multi-market match-label handling, momentum score clamping, signal settlement — including the Over/Under totals settlement logic, in both the live and replay-path code — the API key authentication middleware's fail-closed behavior, the Supabase persistence service's fail-open behavior against a mocked client, the market maker's spread/reliability model, the Arena's Momentum Follower/Contrarian/Kelly Criterion position logic (including risk-limit rejection) and variable-stake ROI math, the retroactive backtest orchestration against archived signals, the scores-context freshness gate and its graduated tightness companion, the insert-only archive's fail-open behavior on both write and read, the archive read endpoint's query-param parsing/clamping, the Outcome Audit council's dissent computation/aggregation, the feed health module's cycle/odds/coverage checks and status derivation, the market maker band-breach cross-check/summary, the steam detection module's tick-sequence/window/trailing-run logic, the signal correlation module's backend-deduplicated session-windowing/cluster-filtering logic and its pattern-matched variant, the composite confidence score's weighting/renormalization and longshot penalty, the signal-type performance aggregation, the historical pattern match's similarity ranking, the event-latency aggregation, and the shared SSE stream monitor's connect/reconnect/backoff/status-derivation logic. Test files are excluded from the production TypeScript build output.
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

A hand-written OpenAPI 3.0 spec (`openapi.yaml`, covering all 24 endpoints with full schema detail) is served live as an interactive Swagger UI at `GET /api/docs` — publicly accessible like every other GET route, so a judge or reviewer can browse and try real requests against the live API with zero setup. Documents the `X-API-Key` requirement and both rate limits precisely rather than leaving them implicit.

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
- Agent vs Agent Arena (Momentum Follower vs Contrarian vs Kelly Criterion, tamper-evident SHA-256 ledger hash)
- Insert-only permanent signal archive to Supabase, readable via a paginated/filterable read endpoint
- Feed health monitoring (cycle health, live-match odds freshness, fixture coverage) separate from match-odds signals
- Market Maker double-confirmation cross-check: genuinely independent band-breach test against each signal's own severity
- Steam move detection: sustained same-direction tick-sequence pressure, distinct from single-pair compression
- Signal correlation: detects cross-match signal clusters within a short time window
- Composite confidence score (0-100) on every signal, blending magnitude, field pressure, and freshness tightness
- Historical hit-rate per signal type from the permanent archive, now visible on the dashboard's Signal Performance panel
- Confidence-calibration, Steam Move Detection, and Signal Correlation dashboard panels (full dashboard visibility for previously backend-only features)
- Historical Pattern Match: nearest-neighbor similar past signals surfaced in the signal detail modal
- Verification Depth Score: plain-label on-chain verification status badge, never inferred
- Meta-agent recommendation and Skeptic Check: ROI-normalized agent ranking with a real match-concentration audit
- Draw-side (three-way) signal evaluation across detection, settlement, and the Arena
- Kelly Criterion risk-limit rejection with an explicit reason code, not just a silent stake clamp
- Probability-point-shift reporting, separate from raw odds compression
- Permanent match archive (`match_archive`), a second insert-only Supabase table alongside the signal archive
- Second live push-stream monitor (odds side) with derived connectivity status labels
- CI (GitHub Actions), pinned dependencies, explicit CORS allowlist, MIT license, upsert-based archive idempotency, `/api/metrics`
- Automated unit tests (276 as of 2026-07-11 — see CI badge/`npm run test` for the current count)

## Outcome Audit Layer

Beyond the core signal loop, GoalPulse includes a second, independent audit layer (`GET /api/replay/backtest`) that replays every stored real TxLINE signal through three additional checks:

- **Three-Agent Council Vote** — each signal is independently scored by a Movement Detector, a Mean Reversion Guard, and an Evidence Correlator, which vote approve, watch, or reject. A signal is only marked "approved" with at least two of three votes, so every decision has a visible, multi-angle rationale instead of a single black-box score.
- **Dissenting-Vote Detail** — each signal now reports `unanimous` (true only when all three agents approved) and `dissentingAgents` (which agent(s) didn't), and the run-level summary reports how often the council actually disagrees (`unanimousSignals`, `dissentingSignals`, `dissentRatePct`, and a per-agent dissent count). Disagreement between the three agents is now queryable data in its own right, not just an internal tiebreak buried inside each signal's raw vote list.
- **Smart Money Trap Detection** — signals that were rejected by the final result are classified as `OUTCOME_REJECTED_MOVE`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating, turning a wrong call into a structured, explainable category instead of a silent miss.
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
- GET /api/arena (Momentum Follower vs Contrarian vs Kelly Criterion scoreboards, SHA-256 tamper-evident ledger hash)
- GET /api/arena/backtest (retroactive Momentum Follower/Kelly Criterion backtest against the full archive)
- GET /api/archive (paginated, filterable read over the permanent signal archive)
- GET /api/feed-health (cycle health, odds freshness, fixture coverage diagnostic)
- GET /api/market-maker/confirmations (band-breach cross-check against each signal's own severity)
- GET /api/steam-moves (sustained same-direction tick-sequence detection)
- GET /api/signal-correlation (cross-match signal cluster detection)
- GET /api/signal-correlation/patterns (pattern-matched cross-match clusters)
- GET /api/signal-performance (historical hit-rate per signal type)
- GET /api/signal-performance/by-confidence (accuracy bucketed by composite confidence score)
- GET /api/signal-performance/event-latency (event-to-market reaction latency stats per severity tier)
- GET /api/archive/similar-signals (nearest-neighbor similar past signals for a given target signal)
- GET /api/metrics (uptime, decision latency, stream staleness, duplicate-drop counters)
- GET /api/replay/backtest (council vote, trap classification, SHA-256 proof hash)
- GET /api/onchain/validate-stat (real on-chain Merkle proof validation via Solana)
- GET /api/live/odds-stream (Server-Sent Events, live)
- GET /api/live/replay-stream (Server-Sent Events, demo replay)
- GET /api/docs (interactive Swagger UI documenting every endpoint)
- POST /api/agent/run-once (requires X-API-Key header, rate-limited 10/min)

27 endpoints total (26 routes plus /api/docs).

## Demo Flow

The dashboard now includes an in-app 22-step Guided Tour (`judgeDemoSteps` in `App.tsx`) that walks a judge through every panel with spotlighting, superseding a fixed manual script. The authoritative, current demo script — with concrete spoken lines — is `DEMO_CHECKLIST.md`'s "Recommended Live Path" section; its "Final Demo Order" summary (target 4-6 minutes):

1. Opening problem statement.
2. Production app + `/health` check.
3. Guided Tour — fast pass through all 22 steps (Market Board, Odds Chart, Signal Intelligence, Field Pressure, Reliability, Results Settlement, Replay Mode, In-Play Market Maker, Steam Move Detection, Agent vs Agent Arena with Meta-agent/Skeptic Check, Outcome Audit council/proof hash, Signal Archive, Signal Performance, Confidence Calibration, Signal Correlation).
4. Agent vs Agent Arena deep dive: three agents, rejection reasons (including risk-limit rejection and draw-signal handling), tamper-evident SHA-256 ledger, real Solana verification.
5. Signal detail deep dive: click a signal to show Historical Pattern Match ("similar past signals") and Verification Depth Score.
6. Signal Correlation deep dive, with an honest empty-state fallback line since that panel is the most likely to show sparse data live.
7. Compliance boundary close.

Also worth showing if time remains: `GET /api/docs` (interactive Swagger UI, all 27 endpoints), `GET /api/metrics` (uptime/latency/stream-staleness), the CI badge and LICENSE in the repo, and the Verified Case Studies panel with its small-sample disclaimer.

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
- Full external technical review (P0 + P1 + Mandatory Test Plan/DoD) closed out and independently verified live in production on 2026-07-11 — see `PROJECT_STATE.md` for the complete, current record. `PROJECT_STATE.md` is the authoritative up-to-date reference; this document reflects the state of the project as of that closure.
