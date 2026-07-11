# GoalPulse Agent — Project State

**As of:** 2026-07-11. This document is a session-handoff brief — read this
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

🔄 In Progress — LIKELY SESSION HANDOFF POINT (user may be switching
tools/sessions here, 2026-07-11): everything through the
P1-4/P1-5/P1-8/P1-19 revisits is done and pushed (Tier 1, Tier 2, P1-3,
P1-2, P1-1, P1-7, P1-16, revisits — all reviewed/approved/pushed/
verified live). The 20 Mandatory Tests + 15-item Definition of Done
investigation pass is ALSO complete — see "RESUME POINT" further below
for the full verbatim lists, every verdict, and **4 real gaps found
that are reported to the user but NOT YET FIXED, awaiting their
decision on priority/scope.** A fresh session/tool should read that
full section before doing anything else — do not re-run the
investigation, the findings are already real and current as of
2026-07-11.

**Vercel deploy pipeline fixed 2026-07-09** (see "Vercel deploy incident"
below) — both the Signal Archive and Signal Performance dashboard panels
are confirmed live in production with real data. Auto-deploy on push to
`main` is live going forward.

**Render bandwidth-suspension incident fixed 2026-07-10** (see "Render
bandwidth-suspension incident" below) — free-tier bandwidth cap, not a
code bug; fixed by adding a card to the Render workspace. Service
confirmed back to "Deployed" and healthy.

✅ **2026-07-10 audit close-out:** fixed the ArenaPanel/Kelly Criterion
frontend wiring gap (real judge-facing bug — third scoreboard was
silently dropped, see "Bugs found and fixed" below) and synced
README.md/TECHNICAL_DOCS.md/SUBMISSION_NOTES.md against current code
(181 tests, 24 openapi-documented endpoints, added the missing
`/api/signal-performance/by-confidence` to all three endpoint lists, and
documented both the Vercel and Render deploy incidents in all three).
`npm run build` clean in `apps/web`. Merged and pushed to `main`
(`195d7b6`).

✅ **`match_archive` table shipped 2026-07-10** — the last purely-deferred
backlog item. Insert-only Supabase table permanently recording every
match's final state the first time it's observed as `"finished"`,
independent of whether the match ever produced a signal (closing the gap
where a match with zero signals left no permanent trace once it aged out
of the in-memory 20-cap `recentFinishedMatches` or the process
restarted). `store.ts`'s `upsertRecentFinishedMatches` now returns the
newly-finished matches on each call; a new `archiveMatch()` in
`services/archive.ts` (same fail-open contract as `archiveSignal`) is
wired into all three existing callers (the live agent cycle, plus both
lazy-backfill routes). Write-only, same as `signal_archive` shipped
initially — no new read endpoint, no dashboard panel, no wiring into
Arena's backtest Contrarian exclusion (a plausible future beneficiary,
not built this round). Built via subagent-driven-development in an
isolated worktree, all three tasks reviewed clean, final whole-branch
review clean (189 tests, 18 files). Spec:
`docs/superpowers/specs/2026-07-10-match-archive-design.md`, plan:
`docs/superpowers/plans/2026-07-10-match-archive.md`.

✅ **Confidence Calibration dashboard panel shipped 2026-07-10** — first
of three prioritized dashboard-visibility panels for backend features
built earlier this session with no frontend surface (ranked ahead of
Steam Move Detection and Signal Correlation; Feed Health Monitoring
deprioritized as lowest judge wow-factor). New
`ConfidenceCalibrationPanel.tsx` renders
`GET /api/signal-performance/by-confidence` as ascending accuracy bars per
confidence bucket — the "is our confidence score actually calibrated"
story, reusing existing colors/bar patterns, zero new dependencies. Pure
addition: only touched `App.tsx` (+3 lines: import + render), no existing
panel edited. Note along the way: Signal Performance was already believed
covered (it has a panel, `SignalPerformancePanel.tsx`), but that panel
only renders `/api/signal-performance` (by signal type) — the
`/api/signal-performance/by-confidence` endpoint and the `confidenceScore`
field itself were still nowhere in the frontend before this panel.
Verified in a local dev browser against live production data (correctly
showed the empty state — production has no settled, confidence-scored
signals yet). 189 backend tests + backend build + frontend build all
green on merged `main`. Merged and pushed (`353688e`). Spec:
`docs/superpowers/specs/2026-07-10-confidence-calibration-panel-design.md`,
plan: `docs/superpowers/plans/2026-07-10-confidence-calibration-panel.md`.

✅ **Steam Move Detection dashboard panel shipped 2026-07-10** — second of
the three prioritized dashboard-visibility panels. New
`SteamMoveDetectionPanel.tsx` polls `GET /api/steam-moves` every 5s
(matches the backend's own agent-cycle interval and `MarketMakerPanel`'s
existing live-polling convention, unlike the two prior one-shot
historical panels) and shows any currently-detected sustained
same-direction odds move: match, home/away side, `firstOdds → lastOdds`
compression %, tick count, and duration. Pure addition: only touched
`App.tsx` (+3 lines: import + render, placed after `MarketMakerPanel`),
no existing panel edited. Production currently shows the empty state
(`"No steam move happening right now — scanning every 5s."`) as
expected — 24 matches scanned, 0 active steam moves at verification
time, a real and common condition given the tournament has narrowed to
~4 remaining matches, not a bug. Verified in a local dev browser:
confirmed 3 successful 200 polls over ~12s at the correct cadence, no
console errors. 189 backend tests + backend build + frontend build all
green on merged `main`. Merged and pushed (`e65d3f8`). Spec:
`docs/superpowers/specs/2026-07-10-steam-move-detection-panel-design.md`,
plan: `docs/superpowers/plans/2026-07-10-steam-move-detection-panel.md`.

✅ **Signal Correlation dashboard panel shipped 2026-07-10** — third and
last of the three prioritized dashboard-visibility panels; the
dashboard-visibility initiative (Confidence Calibration, Steam Move
Detection, Signal Correlation — Feed Health Monitoring deliberately
deprioritized as lowest judge wow-factor) is now complete. New
`SignalCorrelationPanel.tsx` fetches
`GET /api/signal-correlation/patterns` (one-shot, historical/aggregate,
not polling — same convention as Confidence Calibration).

**Data-quality finding made during this panel's brainstorm:** neither
`/api/signal-correlation` nor `/api/signal-correlation/patterns` account
for the totals-line overcounting bug already fixed elsewhere for Signal
Performance (`baseMatchId` dedup, `signalPerformance.ts:20`) — a totals
signal's `matchId` is `<fixtureId>-totals-<line>`, so one real match
firing across several of its own totals lines was being reported as a
multi-match "cluster." Verified against live data: 6 of 7 raw
pattern-matched clusters were single-match artifacts, not genuine
cross-match correlation. User chose the lower-risk fix (client-side
dedup/filter in the new panel only, no backend endpoint change) over
fixing `signalCorrelation.ts` server-side, given the July 19 deadline —
the backend-correct version remains a deferred future option, same
`baseMatchId` pattern already proven for Signal Performance.

The panel dedupes each cluster's `matchIds` client-side and only renders
clusters with 2+ genuinely distinct real matches — each surviving card
shows the pattern (side · severity · market), the deduped match count,
signal count, time span, and the real match IDs. Pure addition: only
touched `App.tsx` (+3 lines, placed after `ConfidenceCalibrationPanel`),
no existing panel or backend file edited. Dedup/filter logic verified
twice against live data (a standalone script, and live in a dev
browser as production data grew between checks — 1 genuine cluster,
then 2, both times correctly identified). 189 backend tests + backend
build + frontend build all green on merged `main`. Merged and pushed
(`86f8615`). Spec:
`docs/superpowers/specs/2026-07-10-signal-correlation-panel-design.md`,
plan: `docs/superpowers/plans/2026-07-10-signal-correlation-panel.md`.

✅ **Dashboard-visibility initiative closed out 2026-07-10** — user
confirmed all three panels live in production: Signal Correlation shows
a real, correctly-formatted 2-match cluster, no console errors, no
regressions. Combined with the earlier live confirmations for Confidence
Calibration and Steam Move Detection, all three prioritized panels are
shipped, merged, and verified live.

✅ **Odds movement chart timestamp ordering bug fixed 2026-07-10** — user
reported the live Spain vs Belgium chart's x-axis wasn't chronological
(...07:47, 07:48, 07:47, 07:47...). Root cause: `GET /api/recent-results`
re-sorted the shared `store.oddsSnapshots` array ascending, inverting the
descending (newest-first) invariant every other reader depends on — see
"Bugs found and fixed" below for full detail. Two commits, both verified
against live production data (not just local): `mergeOddsSnapshots()` fix
(`569bad6`), then a second instance found while verifying live —
`persistence.ts`'s restore path baking in legacy corrupted order forever —
fixed by re-sorting on restore (`95436aa`). 192 tests passing.

✅ **Real-time TxLINE odds stream connectivity monitor shipped 2026-07-10**
— second SSE monitor, additive to and independent from both the existing
scores-stream monitor and `agent.ts`'s polling loop (which remains the
sole source of odds data for signal generation and the odds chart; no
change to either). Extracted the scores stream's connect/reconnect/
backoff/SSE-parse logic out of `txlineStream.ts` into a shared
`services/sseStreamMonitor.ts` factory (`createSseStreamMonitor`, 9 unit
tests with mocked `fetch`), so both streams run the same tested code path
instead of duplicated logic; `txlineStream.ts` is now a thin wrapper
(unchanged exported names/behavior) and `txlineOddsStream.ts` is the new
odds-side equivalent. Wired into `/health` as `liveOddsStream` alongside
the existing `liveStream` field. Purely observational, same scope as the
scores stream — proves *that* JSON frames arrive, never inspects payload
contents, never touches `store`. Deliberately stays on the safe side of
the boundary drawn in `docs/superpowers/specs/2026-07-09-txlinestream-extension-assessment.md`
(wiring live-stream events into signal generation is a no-go before July
19). Verified live in production after deploy: both streams `connected:
true`, scores climbing 5→8 events and odds climbing 38→49 events over a
10s window, zero reconnects/errors on either. Spec:
`docs/superpowers/specs/2026-07-10-odds-stream-monitor-design.md`, plan:
`docs/superpowers/plans/2026-07-10-odds-stream-monitor.md`. 201 tests
passing.

✅ **Guided tour updated with 7 missing panel steps, plus a real highlight
bug found and fixed 2026-07-10** — the judge-facing "Guide" tour
(`judgeDemoSteps` in `App.tsx`) hadn't been touched since several major
panels shipped this session: Market Maker, Steam Move Detection, Arena,
Signal Archive, Signal Performance, Confidence Calibration, Signal
Correlation. Added one step per panel (13 → 20 steps), inserted at
sensible points (Market Maker/Steam Move/Arena near the other live
panels; Archive/Performance/Confidence Calibration/Correlation grouped
near the end as historical-proof panels), all steps renumbered.

**Bug found during the same pass, live-verified twice (first check hit a
race-condition false positive on a rapid click-through; a slower, careful
re-check confirmed the fix):** there are two independent highlight
systems in the tour — React inline conditionals on 4 specific elements,
and a separate imperative system (`applyGuideSpotlight`, via
`classList.add()`) driven by a `guideTargets[step]` array. The array
still had its old 13-item mapping and was never updated when the 7 new
steps were inserted, so at the new step 11 it looked up `guideTargets[10]`
— still the old `"guide-proof-readiness"` entry — spotlighting the wrong
element via a stale index. Fixed by updating `guideTargets` to the
correct 20-entry mapping. Verified by inspecting actual DOM state (ring
class + `data-guide-active`) at each of the 4 previously-affected steps,
not just screenshots, then confirmed live in production.

✅ **Odds chart signal markers enriched 2026-07-10** — severity-coded
`ReferenceDot` markers (HIGH rose/r7, MEDIUM amber/r5.5, LOW slate/r4,
replacing the old side-based orange/green fill) plus richer hover
tooltips showing `confidenceScore`, field pressure, and the existing
reasoning text — all pure passthrough of fields already on `AgentSignal`,
no new client-side computation (deliberately not
`SignalIntelligencePanel.tsx`'s private `calculateConfidence()`
heuristic, which stays untouched/unreferenced). Also fixed a real bug:
`chartData` was hardcoded to `oddsHistory.slice(-18)`, so any point
carrying a signal marker vanished (or got misattributed via a
`fallbackPoint` approximation) once 18 newer SSE ticks arrived, even
though the backend already sends up to 100 historical snapshots per
tick. New `findNearestSnapshot` (real timestamp-proximity matching,
replacing the old minute-precision `formatTime()` string comparison)
lets `chartData` always include signal-matched snapshots plus a capped
sample of recent non-signal ones; `chartSignalMarkers` matches against
that guaranteed-correct set, so the old fallback hack is gone entirely.
Considered and rejected an RSI-style secondary confidence/field-pressure
strip below the chart — those values only exist at the sparse few
x-positions a signal fired, unlike RSI's every-candle computation, so a
continuous strip would be mostly empty. Frontend-only (`App.tsx`), 4
commits, Inline Execution. Verified live in production: legend shows
three severity swatches, tooltip shows Confidence/Field pressure/
reasoning text correctly (including the "—" fallback when a field is
absent), no console errors. Spec:
`docs/superpowers/specs/2026-07-10-odds-chart-signal-markers-design.md`,
plan: `docs/superpowers/plans/2026-07-10-odds-chart-signal-markers.md`.

✅ **Historical Pattern Match shipped 2026-07-10** — first of the four
"future ideas" candidates recorded earlier this session, now built. New
`logic/historicalPatternMatch.ts`'s `findSimilarSignals()`: hard filter
on `signalType` (a pure deterministic function of `severity`, so treating
them as two separate similarity axes would double-count the same fact),
ranked by distance on `oddsChangePct` and (only when both sides have it)
`evidence.scoresContext.fieldPressureScore`. Excludes the target signal's
own match via `baseMatchId` and caps each *other* match to its 2 closest
entries — the same match-concentration bug class already found and fixed
twice this session (Signal Performance's `distinctMatchCount`, Signal
Correlation's client-side dedup) — before it could recur here. New
`GET /api/archive/similar-signals` (query params carry the target
signal's own fields directly, no id lookup), computed fresh per request
like every other archive-backed endpoint, no caching layer. Surfaces as a
new "Similar past signals" section in the existing `selectedSignal`
detail modal (not `SignalIntelligencePanel`, which only ever shows one
computed "best" signal system-wide) — shows `"Not enough similar past
signals yet."` below 3 results, matching `ConfidenceCalibrationPanel`'s
existing small-sample phrasing convention above that.

7 commits (3 backend logic/tests, 1 route+OpenAPI, 1 frontend). Backend:
216 tests (up from 189 — added `historicalPatternMatch.test.ts` and 6
cases to `paginationParams.test.ts`), clean build. Frontend: clean build.
Verified live in production: opened a HIGH SHARP_MOVE signal's detail
modal, "Similar past signals" section rendered 5 ranked results, the
match-cap held (`18202783` appeared exactly twice, its totals-suffix
siblings once each), accuracy shown honestly (1/5 correct, 20%) —
consistent with the SHARP_MOVE concentration/accuracy issue already
documented under "Open questions" below, not a new bug. Spec:
`docs/superpowers/specs/2026-07-10-historical-pattern-match-design.md`,
plan: `docs/superpowers/plans/2026-07-10-historical-pattern-match.md`.

✅ **Verification Depth Score shipped 2026-07-10** — second of the four
"future ideas" candidates, now built. Plain-label (never a percentage —
user-corrected during brainstorming: there's only one real on-chain
claim checked per signal today, `statKey=1002`, so a fractional score
would be fabricated precision) status badge in the existing Outcome
Audit Layer, next to the pre-existing "Verify on Solana" button and
proof hash. States: not independently verifiable (no
`evidence.fixtureId`/`scoresContext.sequence`) / not yet verified /
checking on-chain / on-chain verified / verification failed /
verification unavailable — never inferred, only ever the result of an
actual live Solana `.view()` RPC call via the existing
`GET /api/onchain/validate-stat`.

Bundled a real pre-existing bug fix (confirmed in-scope during
brainstorming): `onchainVerify` was a single shared piece of state, not
keyed per signal — switching the selected signal left the previous
signal's stale result showing until Verify was clicked again. Re-keyed
by `` `${fixtureId}-${sequence}` ``. Found and fixed a 4th consumer of
the old shared shape during implementation that the plan's own code
search had missed (the analyst-chat answer function).

Frontend-only, `App.tsx`, 2 commits, Inline Execution, no backend
changes (`GET /api/onchain/validate-stat` already provided everything
needed). Verified live in production: the "not verifiable" state and
disabled button confirmed correct across multiple different signals; the
"not yet verified"/"checking"/"on-chain verified" states and the
staleness fix were verified with a real Solana mainnet check
(`PROOF VALID`) during implementation, since no currently-eligible
signal was reachable in live production data at verification time — the
user explicitly accepted that earlier real-mainnet test as sufficient
evidence for those states. No console errors from this feature.

**Noted, not a bug:** a batch of transient "Failed to fetch" console
errors across several panels (Arena, Market Maker, Steam Moves, Results
Settlement, Signal Intelligence) appeared right at this deploy's Vercel
transition window; confirmed self-resolving — a reload minutes later
showed zero errors. Expected brief blip during any deploy, not specific
to this feature; no action taken.

Spec: `docs/superpowers/specs/2026-07-10-verification-depth-score-design.md`,
plan: `docs/superpowers/plans/2026-07-10-verification-depth-score.md`.

✅ **DEMO_CHECKLIST.md rewritten 2026-07-10 to match the app as built**
— the pre-session checklist only covered Market Board, Odds Chart,
Signal Intelligence, Field Pressure, Reliability, Results Settlement,
Replay Mode, and the old 13-step tour; every feature built this session
was missing from the actual demo script. Docs-only, no code risk.
Added a **Recommended Live Path** (concrete spoken **Say:** lines for a
4-6 min live run, not just "show panel X"): Opening Problem → app/health
→ Guided Tour breadth pass (all 20 steps) → Agent vs Agent Arena deep
dive → Historical Pattern Match + Verification Depth signal-detail deep
dive → Signal Correlation deep dive (with an honest empty-state fallback
line, since that panel is the most likely of the three to show sparse
data live) → Compliance close. Full Checklist section renumbered 1-16
with new sections for every session feature previously undocumented:
Arena, Market Maker, Full Tournament Archive, Signal Performance,
Confidence Calibration, Steam Move Detection, Signal Correlation, plus
updated Odds Chart bullets for the severity-marker/tooltip work.
Flagged that the app has two separate "Verify on Solana" buttons (Arena's
own vs. the Outcome Audit Layer's per-signal one) so a presenter doesn't
mix them up live. All panel copy pulled directly from current component
source, not guessed — verified via a research subagent before writing.
Pushed (`a96085d`).

✅ **Meta-agent recommendation shipped 2026-07-10** — third of the four
"future ideas" candidates, now built; only Skeptic Agent remains
unstarted. Fixed a real, pre-existing bug in `ArenaPanel.tsx` rather
than adding a parallel feature: the existing "Leading" trophy badge
picked a winner by raw `netUnits` with zero sample-size awareness — the
same concentration-bias class already found and fixed twice this session
(Signal Performance, Signal Correlation) — and wasn't even a fair
comparison in the first place, since Kelly Criterion stakes variable
amounts while the other two always stake flat 1 unit. New
`getMetaAgentRecommendation()` ranks by ROI% instead (stake-size
normalized), requires `settledCount >= 5` per agent and at least 2
qualifying agents before declaring any leader, and hedges the language
when the gap is under 10 percentage points — both calibrated against
real live data checked during brainstorming. The trophy badge now reads
from the exact same computation as the new callout, so the two can never
disagree. Frontend-only (`ArenaPanel.tsx`), 1 commit, Inline Execution,
no backend change (`GET /api/arena` already returned every field
needed). Verified live in production: callout and trophy badge both
named Kelly Criterion, phrasing matched the spec's calibration example
verbatim ("a narrow lead over Momentum Follower... worth revisiting"),
Contrarian's 0 settled positions correctly excluded from ranking, no
console errors. Spec:
`docs/superpowers/specs/2026-07-10-meta-agent-recommendation-design.md`,
plan: `docs/superpowers/plans/2026-07-10-meta-agent-recommendation.md`.

✅ **Skeptic Agent shipped 2026-07-10 — fourth and last of the "future
ideas" candidates, backlog fully closed.** Deliberately built as a
read-only critique layer, not a real 4th Arena agent: a Skeptic never
trades, so it has no side/stake/P&L to track, meaning wiring it into
`ArenaPosition`/`ArenaScoreboard`'s settlement/ledger system would have
meant inventing fake positions to fit a data model that doesn't apply to
it — an architectural mismatch, not just added risk. Chose the smaller,
correct-shaped version instead, explicitly given deadline proximity.

New `getSkepticCritique()` in `ArenaPanel.tsx` audits whichever agent the
Meta-agent recommendation currently names as leader: groups that agent's
settled positions by `baseMatchId` (same pattern already proven in
`signalPerformance.ts`'s `distinctMatchCount`/`largestMatchSharePct`,
including the totals-suffix collapsing) and flags when one real match
accounts for ≥50% of the settled sample — confirming diversification
plainly when it doesn't, not just raising alarms. Real finding used to
calibrate the threshold before writing any code: live production data
showed the Meta-agent's declared leader (Kelly Criterion) had 100% of
its 17 settled positions from a single real match — a striking,
honest, demonstrable validation of why this check matters.

Rendered directly below the Meta-agent recommendation callout, same
file, same visual section. Zero backend changes (`matchId` already on
every position in `GET /api/arena`), zero touch to Arena's settlement
code. Frontend-only, 1 commit, Inline Execution. Verified live in
production: callout read exactly the calibration example verbatim, no
console errors. Spec:
`docs/superpowers/specs/2026-07-10-skeptic-agent-design.md`, plan:
`docs/superpowers/plans/2026-07-10-skeptic-agent.md`.

✅ **Guided Tour expanded to 22 steps 2026-07-11** — covers the four
features shipped 2026-07-10 that predated the tour's last update
(Historical Pattern Match, Verification Depth Score, Meta-agent
recommendation, Skeptic Check), none of which were in the tour at all
before this. New step 10 ("Meta-agent & Skeptic Check") covers both
Arena self-audit features together, via a new `id="guide-meta-skeptic"`
wrapper added around those two callouts in `ArenaPanel.tsx` for precise
spotlighting. New step 16 ("Signal detail: precedent & verification")
is deliberately instructional rather than auto-opened: Historical
Pattern Match and Verification Depth Score both live inside the
`selectedSignal` detail modal, which only renders after a real click and
has no reliable "next signal" for the tour to select — every other tour
step only ever scrolls-to-and-highlights static, always-rendered
elements, so forcing the modal open would have been the tour's first
architectural departure. The step instead highlights the "Latest
signals" list (reusing the existing `id="agent"` target) and instructs
the judge to click "View details" themselves.

**Two independent step-indexed systems had to be updated in lockstep**
— `guideTargets[step]` (the imperative highlight-lookup array) plus four
separate hardcoded `judgeStep === N` React conditionals scattered in
JSX, the exact "second highlight system" already documented as a past
bug source (see "Bugs found and fixed" below, 2026-07-10 guided-tour
entry). A full grep audit of every `judgeStep`/`guideTargets[`/
`judgeDemoSteps[` occurrence was done before writing the spec, not just
the ones anticipated going in — found and correctly shifted all four
JSX literals (10→11, 11→12, 12→13, 13→14) plus a numeric retry-guard
range (`nextStep >= 8 && nextStep <= 10` → `...<= 11`) that pre-fetches
replay-backtest data ahead of the steps that need it.

**One false alarm caught and correctly diagnosed during verification,
not shipped as a fix:** rapid automated clicking through the tour
during testing (sub-second between steps) caused one step to briefly
show a stale highlight from an earlier step — traced to multiple
staggered 700ms retry-guard timeouts firing out of order when clicked
faster than they can settle. Confirmed via a slower, realistic-pace
re-test (3+ seconds between clicks, matching real human reading/
clicking speed) that this never reproduces at normal demo pace — a
pre-existing characteristic of the retry-guard's timeout design (the
same theoretical exposure existed in the original 3-step guarded range
before this change), not a regression introduced here. Not fixed,
since it's not reachable in real usage; noted for awareness only.

Frontend/docs-only, 3 commits, Inline Execution, no backend changes.
Verified live in production twice: once during implementation (full
22-step walkthrough, every step checked not just the new ones) and once
by the user independently post-deploy (clean single-step-at-a-time
pace, all previously-tested steps 12-15 still correct after the shift,
both new steps render correctly, tour completes cleanly). Spec:
`docs/superpowers/specs/2026-07-10-guided-tour-expansion-design.md`,
plan: `docs/superpowers/plans/2026-07-10-guided-tour-expansion.md`.

✅ **External P0 technical review triaged and closed out 2026-07-11.** A
review document proposed 6 "P0" fixes; each was independently
investigated against actual code and live data before any change was
made, per this session's established process.

**Confirmed false premise, not implemented:** P0-1/P0-2 (canonical
multi-bookmaker market key, de-vigged multi-bookmaker consensus).
Independently re-verified with a fresh 300-row sample across three live
endpoints (`/api/odds-history`, `/api/signals`, `/api/archive`) —
`evidence.bookmaker` is a single constant value
(`TXLineStablePriceDemargined`) on every row, and `txlineClient.ts` only
ever does a straight `bookmaker: odds.Bookmaker` passthrough with zero
aggregation logic anywhere. Building canonical-key/consensus
infrastructure would solve a problem the real data doesn't have —
consistent with the already-settled 2026-07-08 finding that TxLINE's
feed is single-source Stable Price consensus, not raw multi-bookmaker
data.

**Confirmed already addressed, no new code:** P0-3 (historical replay
temporal leakage). Traced the exact `/api/replay/backtest` code path:
signal detection only ever compares a tick to its immediately preceding
one in a chronologically-sorted list, the existing
`scoresContextFreshness.ts` gate applies uniformly to snapshots
regardless of live-vs-replay origin, final-score-dependent settlement
runs strictly after detection and never feeds back into severity/
confidence, and `signalEngine.ts` has zero `Date.now()`/`Math.random()`
calls — replay is provably deterministic.

**Confirmed nuanced, no structural gap:** P0-6 (autonomous paper-position
lifecycle). Contrarian already has a genuine causal rejection check
before opening a position (`buildContrarianPosition` returns `null` when
`!isMarketOnlyMove(signal)`); Kelly Criterion has an implicit soft-reject
via near-zero stake at low confidence; Momentum Follower intentionally
has none (that's its "take every signal" identity). The one real gap —
no visible "rejected because X" trace anywhere when a strategy silently
skips a signal — is a minor transparency nice-to-have, not worth new
state-machine code this close to the deadline (user's explicit call).

**Confirmed real, fixed:** P0-4 (`CONFIRMED_TRAP` asserted a certainty
of manipulation/trap that a signal simply losing at settlement doesn't
prove) and P0-5 (`ArenaPanel.tsx`'s "Tamper-evident settlement" section
conflated a purely local SHA-256 ledger hash with a genuinely separate
real on-chain Merkle proof — a different UI surface than the one
Verification Depth Score already fixed). Bundled together: same "say
only what's true" correction category, both mechanical, low-risk.
`CONFIRMED_TRAP` renamed to `OUTCOME_REJECTED_MOVE` across 3 live files
(`server.ts`, `App.tsx`, `pinnedCaseStudies.ts`) plus 4 judge-facing
reference docs (`openapi.yaml`, `README.md`, `TECHNICAL_DOCS.md`,
`SUBMISSION_NOTES.md`) — historical spec/plan docs and
`pinned-case-studies-raw.json` deliberately left untouched (frozen
point-in-time records). Scope grew slightly beyond the raw enum value
during implementation prep, confirmed with the user first: two UI
headlines asserting the same false certainty ("False market move
exposed" → "Market move rejected by outcome") and two "N confirmed"
badge/reply display words → "N rejected" (the underlying JSON field name
`confirmedTraps` stays unchanged — API-contract stability, not
requested). `arena.proof.note` split into two honest, separate claims
(local hash vs. the real on-chain check, which covers different data
than the hash itself).

3 commits, backend 216 tests + clean build, frontend clean build,
openapi valid. Verified live in production twice (implementation +
independently by the user): `/health` clean, the new split proof-note
wording confirmed live verbatim, live `/api/replay/backtest` data
confirmed `trapStatus` values are `["OUTCOME_REJECTED_MOVE",
"LOW_TRAP_RISK", "WATCHING"]` with zero `CONFIRMED_TRAP` remaining
anywhere in production. One honest verification gap on both passes:
neither the implementer nor the user could navigate to the specific
settled signal's detail modal to visually confirm the new headline text
live, due to a pre-existing, unrelated data-shape quirk (the trap-signal
list array renders empty in this session's live data despite the
summary count being non-zero) — code-level consistency (exact same
field/comparison pattern as the badge, which *is* proven live) plus full
API verification gives high confidence regardless. Spec:
`docs/superpowers/specs/2026-07-11-outcome-rejected-move-rename-design.md`,
plan: `docs/superpowers/plans/2026-07-11-outcome-rejected-move-rename.md`.

🔄 **In Progress — RESUME POINT (written 2026-07-11, mid-task, in case of
session loss — this section should be self-sufficient for a fresh
session to pick up without re-reading the rest of this file):**

**Full context:** an external technical review PDF proposed 6 "P0" items
and a longer P1 list, 20 mandatory tests, and a 15-item Definition of
Done checklist. The P0 phase is **fully done** — see the "External P0
technical review triaged and closed out 2026-07-11" entry immediately
above this one for the complete verdict on all 6 P0 items (2 confirmed
false premise/not implemented, 2 confirmed already-addressed/no new
code, 2 confirmed real and fixed/shipped/verified live). That phase is
closed; nothing further needed there.

**Current phase: working through the P1 list, sequenced by the user
into 3 risk/speed tiers (not PDF order) — safest/fastest first.** Full
tier breakdown:

- **Tier 1 (fast, safe, no code-logic risk) — investigated and specced,
  IMPLEMENTATION NOT YET STARTED:**
  - P1-13 (Supabase doc language) — **confirmed already accurate,
    no change needed.** Checked README.md/TECHNICAL_DOCS.md/
    SUBMISSION_NOTES.md directly: every mention correctly frames it as
    periodic-snapshot/restart-recovery, explicitly distinct from the
    separate permanent `signal_archive` feature. TECHNICAL_DOCS.md even
    has a section titled "Supabase Persistence (Periodic Snapshot
    Recovery)." Closed, no further action.
  - P1-14 (SSE doc language) — **confirmed already accurate, no change
    needed.** Same three docs checked, plus the actual
    `/api/live/odds-stream` implementation (confirmed genuine
    `text/event-stream`, not polling). Every doc explicitly says the SSE
    push-stream monitor is "additive to, and independent from, the
    5-second polling loop that remains the source of truth for signal
    generation." Closed, no further action.
  - P1-9 (GitHub Actions CI) — **implemented.** New
    `.github/workflows/ci.yml`: two parallel jobs, backend (`npm ci &&
    npm run test && npm run build` in `apps/api`) and frontend (`npm ci
    && npm run lint && npm run build` in `apps/web`) — matches what
    scripts each app actually has (no `lint` script exists for the
    backend, no `test` script exists for the frontend, confirmed not
    assumed). Node 24 (matches current dev environment), triggers on
    push/PR to `main`. Not yet validated end-to-end (that only happens
    once pushed and GitHub actually runs it).
  - P1-10 (pin dependency versions) — **implemented.**
    `apps/web/package.json` was already fully pinned (no `"latest"`
    entries at all) — untouched. `apps/api/package.json`'s 15
    `"latest"` entries (8 deps + 7 devDeps) pinned to caret-range (`^`)
    versions matching what was already installed, read directly from
    `node_modules`, matching the file's existing convention. Confirmed
    via the `package-lock.json` diff after `npm install` that this
    changed zero actual resolved package versions — only the top-level
    specifier strings.
  - P1-11 (restrict CORS) — **implemented, then refined once per user
    review.** `server.ts`'s `app.use(cors())` (previously fully open,
    any origin) now uses an allowlist: `https://goalpulse-agent.vercel.app`
    (production), `http://localhost:5173` and `http://127.0.0.1:5173`
    (local dev). First pass used the plain-array `cors({ origin: [...] })`
    form — user asked for explicit confirmation that requests with no
    `Origin` header (curl, Postman, server-to-server, direct navigation)
    pass through. Read the actual installed `cors` package source
    (`node_modules/cors/lib/index.js`) to verify precisely rather than
    assume: confirmed the array form was already safe in practice (the
    middleware's non-OPTIONS branch calls `next()` unconditionally
    regardless of origin match — it only ever conditionally sets a
    response header, never blocks a request), but switched to the
    standard explicit function-based pattern anyway
    (`if (!origin || ALLOWED_CORS_ORIGINS.includes(origin)) { callback(null, true); }`)
    since it's self-documenting and doesn't require reading package
    internals to verify safety. Verified via `curl` against: allowed
    origin (header set correctly), disallowed origin (200 OK, no
    allow-origin header — correct CORS rejection, request still
    processes), and no-Origin-header case (200 OK, full normal JSON
    body) — plus confirmed `/api/docs` still resolves (200 after its
    normal pre-existing trailing-slash redirect, unrelated to CORS).
    Only affects browser JS reading cross-origin responses — direct
    navigation to `/health` or `/api/docs` is unaffected either way.
  - P1-12 (add LICENSE file) — **implemented.** MIT license, copyright
    "GoalPulse Agent contributors", added at repo root.

  **Tier 1 status: fully implemented, tested, reviewed, and approved by
  the user — pushed to production.** Commits on `main`: `40cd88b` (spec),
  `6048e06` (plan), `647bba2` (LICENSE), `185596c` (CI workflow),
  `0f28a4b` (dependency pins), `b1ebc87` (CORS allowlist, first pass),
  `c83a702`/`229e059` (PROJECT_STATE + previously-uncommitted plan docs
  housekeeping), `54cc25c` (CORS refined to the explicit function-based
  no-Origin-passthrough pattern per user review — see the P1-11 entry
  above for the full verification trail). Backend: 216 tests pass, clean
  build throughout. Frontend: clean build (no changes to this app in
  Tier 1 — `apps/web/package.json` was already fully pinned).

  **Tier 1 closed out 2026-07-11 — user independently verified live and
  approved.** Confirmed: LICENSE visible in repo file listing, CI workflow
  shows both backend and frontend jobs passing (green checkmarks,
  28s/23s), CORS confirmed working via a real fetch from the actual
  production frontend origin (200 OK). User specifically praised reading
  the actual `cors` package source before making a safety claim on P1-11
  rather than assuming. **Explicit go-ahead given to proceed to Tier 2.**

- **Tier 2 (moderate, additive, low regression risk) — STARTING
  2026-07-11, approved by user:**
  - P1-6: expose rejection reasons (closes the one real P0-6 gap already
    found — Contrarian's silent skip via `isMarketOnlyMove` — plus any
    other implicit rejections found).
  - P1-15: basic metrics (uptime, reconnect count, stale-feed duration,
    decision latency, duplicate drops) — additive only, surface via
    `/health` or a new endpoint.
  - P1-17: bounded queues/retention limits for in-memory arrays — verify
    current caps first (`store.ts` already has some, e.g. `oddsSnapshots`
    capped 800/`signals` capped 100/`agentRuns` capped 50), only add
    where genuinely missing.
  - P1-18: idempotency keys for events/signals/positions/persistence
    writes — investigate current duplicate-handling first, only add
    where a real gap exists.

  **Tier 2 implemented 2026-07-11 — all four items done, awaiting user
  review before push.** Investigated-first, code-only-where-needed, same
  discipline as Tier 1:
  - P1-6: shipped. New `getRejectionReason()` in `logic/arena.ts`
    mirrors the exact null-cases already in the three `build*Position`
    functions without changing their signatures — zero risk to their
    existing tests. `computeArenaScoreboards` now also returns a
    `rejections: ArenaRejection[]` array, exposed as a new top-level
    field on `GET /api/arena`. Scope confirmed Arena-only with the user
    (not the signal-generation-level silent drops in `signalEngine.ts`/
    `signalAlreadyExists`, which remain untouched, out of scope).
    `ArenaPanel.tsx` shows a "N signals not traded" line with reason
    text per agent card. **Real bug found and fixed during live browser
    verification:** `ScoreboardCard` crashed the whole panel if
    `rejections` was ever undefined — a genuine risk given this
    project's documented Render deploy-lag window (frontend deploying
    before/after backend). Now defaults to `[]` defensively. Verified
    live against a local dev server with real TxLINE data: all three
    cards correctly show "4 signals not traded" / "Totals signal —
    Arena only trades 1X2 markets," no console errors.
  - P1-15: shipped. New `GET /api/metrics` endpoint (separate from
    `/health`, matching the `/api/feed-health` precedent) — 
    `uptimeSeconds`, `lastAgentCycle.decisionLatencyMs` (from the
    already-stored `AgentRun` timestamps), `liveStream`/
    `liveOddsStream.staleForMs`, and two new counters,
    `store.duplicatesDropped.{snapshots,signals}`, incremented at the
    two existing dedup branches in `agent.ts`. Persisted/restored
    across restarts via the existing Supabase snapshot round-trip
    (`persistence.ts`) so a Render restart doesn't silently reset them.
    Verified live: `decisionLatencyMs` showed a real 8062ms TxLINE
    fetch, `duplicatesDropped.snapshots` climbed to 86 against live
    duplicate data, confirming both new counters and the endpoint work
    end-to-end. `openapi.yaml` updated; `/api/docs` confirmed still
    resolving.
  - P1-17: investigated, **confirmed already fully covered, no code
    change.** Every in-memory array is already capped (`oddsSnapshots`
    800/`signals` 100/`agentRuns` 50 in `agent.ts`; `recentFinishedMatches`
    20 in `store.ts`), and every newer logic module (`feedHealth`,
    `signalCorrelation`, `historicalPatternMatch`, `signalPerformance`)
    computes fresh from these capped arrays at request time with no
    independent accumulating state. Same verdict pattern as P1-13/P1-14
    in Tier 1.
  - P1-18: shipped, **with an explicit behavior-change note flagged to
    and confirmed by the user before implementation.** `archiveSignal`/
    `archiveMatch` (`services/archive.ts`) switched from a plain
    `.insert()` to `.upsert(..., { onConflict, ignoreDuplicates: true })`,
    guarding against a real restart-timing race: a process crash within
    the periodic-snapshot save window, followed by restart-recovery
    from a slightly-stale snapshot, can re-detect an already-archived
    match/signal as "new" and archive it again. `signal_archive`'s
    constraint is `(signal_id, event)` — a signal still legitimately
    gets two rows (created/settled), only a true re-archive of the same
    event is blocked. **`match_archive`'s `(match_id)` constraint is a
    deliberate change, not a bug fix** — the original 2026-07-10 design
    (`docs/superpowers/specs/2026-07-10-match-archive-design.md`,
    "Duplicate rows (accepted behavior)") explicitly accepted a second
    row per match on restart-rediscovery as intentional, matching
    `signal_archive`'s own insert-only-log precedent. This upsert
    supersedes that decision — the duplicate was never the goal, just a
    tolerated side effect of the original design, and preventing it is
    a genuine improvement. **Requires two manual Supabase SQL
    statements before the dedup takes effect** (same manual-step
    pattern as `match_archive`'s original setup).

  8 commits on `main`: `11ba6f6` (spec), `05ed333` (plan), `0978146`
  (P1-6 logic), `036ecad` (P1-6 route), `e8db48c` (P1-6 frontend +
  defensive-null bugfix), `d2c1b3c` (P1-15 counters), `ef47f86` (P1-15
  endpoint), `f4cd19f` (P1-18), `905a80d` (docs). Backend: 226 tests
  pass (up from 216 at Tier 1 close), clean build throughout. Frontend:
  clean build, verified live in a local dev browser with real TxLINE
  data, zero console errors after the defensive-null fix. Reviewed and
  approved by the user, pushed to `main` 2026-07-11.

  **✅ Tier 2 fully closed out 2026-07-11, including a real pre-existing
  data-quality find during the Supabase constraint rollout.**
  `match_archive_match_id_unique` added cleanly on the first try — zero
  pre-existing duplicates. `signal_archive_signal_event_unique` hit a
  real constraint violation on first attempt: the user found 8 genuine
  duplicate rows across 6 `(signal_id, event)` groups (929 total rows,
  921 distinct groups), **all `event: "created"`, zero `"settled"`
  duplicates** — direct empirical confirmation that the restart-race
  scenario P1-18 was designed to prevent had already happened in
  production before this fix shipped. Investigated via the existing
  `GET /api/archive` read endpoint (no direct DB credentials available
  locally) since `match_archive` has no read endpoint to cross-check the
  same way. Proposed and the user ran a `ROW_NUMBER()`-based dedup
  (deterministic even on an exact-timestamp tie, unlike a plain
  self-join `DELETE`) keeping the earliest `archived_at` per group —
  verified row count went 929 → 921 as predicted, then the constraint
  added successfully. Both constraints confirmed live in the database.

  **Deployed code confirmed active against both constraints**, verified
  without direct Render/Supabase access by checking that other
  same-push, same-deploy-SHA changes (`GET /api/metrics`, the
  `rejections` field on `GET /api/arena`) were live with real data —
  since Render deploys the whole repo at one git SHA, this proves
  `905a80d` (which includes `f4cd19f`, the `archive.ts` upsert change)
  is what's running. Final live confirmation from the user:
  `/api/metrics` showed `duplicatesDropped.signals: 1` (a real
  duplicate genuinely caught by the fix since this deploy), the Arena
  panel showed "82 SIGNALS NOT TRADED" with real reason text, no
  console errors. **P1-18 and all of Tier 2 fully confirmed live,
  approved, closed out.**

- **Tier 3 (bigger engineering, evaluate cost/benefit before starting)
  — STARTING 2026-07-11, approved by user. Sequenced by user choice
  after an explicit cost/benefit pass given the July 19 deadline and
  tournament narrowing to ~4 matches: P1-3 first (lowest risk,
  already-scoped from an earlier session decision), then P1-2 (now
  genuinely useful since `signal_archive` is clean post-dedup).
  P1-1/P1-7/P1-16 deferred unless time remains after those two — P1-1
  is a real architecture change with the tournament in its knockout
  stage (draws largely moot), P1-7 overlaps heavily with the metrics
  P1-15 just shipped, P1-16 is a real state-machine change to the core
  agent loop flagged as the highest-risk item this close to deadline.**
  - P1-1: draw-side signals (home/draw/away, not just home/away).
  - P1-2: calibrate 4%/8%/15% thresholds using real archived samples —
    real data only, never invented numbers.
  - P1-3: move signal-correlation dedup to backend (currently
    client-side by design, per an earlier deliberate 2026-07-10 tradeoff
    this session — re-verify that decision still holds before changing
    it, don't assume it's stale).
  - P1-7: event-to-market reaction latency metrics.
  - P1-16: graceful degraded states (INITIALIZING/SYNCING/STREAMING/
    ANALYZING/DEGRADED/RECONNECTING/CIRCUIT_BREAKER/STOPPED) — a real
    state-machine addition, evaluate scope carefully before committing,
    flag to the user if it looks likely to risk regressing something
    already stable/demo-verified.

  **✅ P1-3 implemented 2026-07-11, awaiting user review before push.**
  `logic/signalCorrelation.ts`'s `findSignalClusters` and
  `findPatternMatchedClusters` both now dedupe `matchIds`/`matchCount`
  and the "2+ distinct matches" threshold by real fixture id
  (`baseMatchId`, same implementation already proven in
  `signalPerformance.ts`) instead of raw `signal.matchId` — a totals
  signal's matchId carries a `-totals-<line>` suffix, so multiple lines
  from the same real match no longer count as a false multi-match
  cluster. In-place semantics change to `matchIds`/`matchCount` on both
  `GET /api/signal-correlation` and `GET /api/signal-correlation/patterns`,
  approved during brainstorming (no other consumer depended on the raw
  form). Both client-side workarounds — `SignalCorrelationPanel.tsx`'s
  `baseMatchId`/`distinctRealMatches`/`GenuineCluster` and `App.tsx`'s
  analyst-chat handler's independent copy of the same pattern — deleted
  entirely now that the backend owns deduping.

  **Real-world confirmation the fix was needed, found during live
  verification:** production's still-live pre-fix code currently shows
  a `matchCount: 5` "cluster" for fixture `18218149` that is actually
  a single real match across 5 different totals lines — the exact
  false positive this fix eliminates. Verified the fix itself against
  a local dev server with real accumulated signal data: the panel
  showed a genuine 2-real-match cluster (`Match 18218149`,
  `Match 18237038`, two distinct fixtures, no totals-suffix artifacts),
  and the analyst-chat's "any signal correlation clusters?" answer
  matched the panel exactly ("1 genuine cluster... 2 real matches").

  6 commits on `main`: `758c209` (spec), `b2ac9b2` (plan), `31f944e`
  (backend dedup fix, 4 new tests), `1858117` (frontend simplification),
  `04e9389`/`273a767` (docs). Backend: 230 tests pass (up from 226 at
  Tier 2 close), clean build. Frontend: clean build. Reviewed and
  approved by the user, pushed to `main` 2026-07-11.

  **✅ P1-3 fully closed out 2026-07-11, confirmed live in production**
  (not just the local dev server check above): `GET /api/signal-correlation`
  showed `matchCount: 2` for a genuine 2-real-match cluster, no
  totals-suffix inflation. The Signal Correlation panel and the
  analyst-chat answer both showed the honest empty state at
  verification time (the sliding correlation window had moved on from
  the earlier local check) — consistent with each other, confirmed not
  a bug. No console errors. **P1-3 approved, closed out.**

  **✅ P1-2 implemented 2026-07-11, awaiting user review before push —
  reframed after data investigation.** The original ask ("calibrate
  the 4%/8%/15% severity thresholds") turned out not to be the real
  problem: investigating 294 real settled `signal_archive` rows (via
  `GET /api/archive`, no direct DB access) found accuracy correlates
  almost perfectly with the underlying **decimal odds level**, not the
  percentage-compression magnitude severity is based on — 1X2 accuracy
  broke from 60% to 0% right at `oddsAfter=3`; totals broke from
  62-63% to 25-27% at the identical odds level (just never reaching
  1X2's extreme longshot range, max 18.4 vs 720). Manually inspecting
  the raw rows confirmed the mechanism: most incorrect 1X2 signals
  fired on the *already-losing* team deep in a match (e.g. Morocco
  down 2-0), which essentially never wins outright from there.

  User reviewed the finding directly and chose to build a real fix.
  New `LONGSHOT_ODDS_THRESHOLD = 3` / `LONGSHOT_CONFIDENCE_FACTOR = 0.3`
  in `logic/signalEngine.ts` — both real, data-derived values (0.3 is
  the actual combined accuracy ratio across both markets, 17.8%/62.9%
  ≈ 0.283, rounded), not invented. Applied as a multiplicative penalty
  on `calculateConfidenceScore`'s existing 3-component composite
  (magnitude/fieldPressure/freshness), computed exactly as before and
  then reduced only when `oddsAfter >= 3` — every non-longshot
  signal's score is byte-for-byte unchanged. `buildContextExplanation`
  adds a matching transparency sentence, only when the penalty
  applies. **Per explicit user request, the sample-size caveat (49
  settled 1X2 signals, concentrated in 3 matches, ~4 tournament
  matches left) is documented directly in the code comment above the
  two constants, not just the spec** — anyone reading the code cold
  sees immediately that these are provisional, not authoritative.

  **Free second-order benefit, no code change:** Arena's
  `calculateKellyStake(oddsAfter, confidenceScore)` already scales
  stake down as confidence drops, so Kelly's stakes on longshot
  signals shrink automatically now that they honestly report low
  confidence — a real improvement to the Arena's worst-performing
  exposure, achieved without touching `arena.ts`.

  2 commits on `main`: `82ad41b` (implementation + tests), `df2413e`
  (docs). Backend: 234 tests pass (up from 230 at P1-3 close), clean
  build. Reviewed and approved by the user, pushed to `main` 2026-07-11.

  **✅ P1-2 fully closed out 2026-07-11, confirmed live in production**
  via `GET /api/replay/backtest`: a real historical signal
  (`oddsAfter: 180`) showed `confidenceScore` reduced to `15.55` with
  the exact designed caveat sentence attached — same code path as the
  live feed, so this is genuine proof the fix is live and correct.
  Note for context, not a bug: `GET /api/signals`' live feed at
  verification time only showed old pre-restart signals restored from
  a Supabase snapshot (predating this deploy) plus one new
  sub-threshold signal (`oddsAfter: 1.95`, correctly unpenalized) — no
  fresh longshot had fired live yet since deploy, which is why the
  replay endpoint was used instead. **P1-2 approved, closed out.**

  **User decided to continue through the full remaining PDF list
  2026-07-11, in explicit order:** P1-1 → P1-7 → P1-16 → revisit
  P1-4/P1-5/P1-8/P1-19 (previously skip-listed, now in scope since
  everything is being done) → the 20 mandatory tests → the 15-item
  Definition of Done. Each item gated individually: investigate →
  report → brainstorm → spec → plan → implement → tests → build →
  user reviews diff → merge → user verifies live → next item. User
  explicitly flagged P1-16 as the biggest remaining item and asked to
  be told before starting if it risks destabilizing the demo this
  close to July 19.

  **✅ P1-1 implemented 2026-07-11, awaiting user review before push.**
  Wires the already-flowing `drawOdds` data (Market Maker already
  quoted it; just never fed into signals) into the full 1X2 pipeline:
  `TeamSide` widened to `"home" | "away" | "draw"`;
  `buildSignalFromSnapshots` now compares `drawCompression` in a 3-way
  max alongside home/away; settlement (`store.ts`) settles a draw
  signal correct when the final score is level; Steam Move Detection
  now scans all three sides (user-approved in-scope extension).
  **Contrarian explicitly does not trade draw signals** — no
  principled "opposite" in a 3-outcome market, so it returns `null` and
  surfaces a new `draw_signal` rejection reason via the existing P1-6
  mechanism, rather than inventing a fade heuristic (user-approved
  decision). Momentum Follower and Kelly Criterion needed no logic
  change — both already read `side`/`target`/`oddsAfter`/
  `confidenceScore` generically.

  **Real gap found only at build time, outside the original
  investigation:** `logic/signalCorrelation.ts`'s `PatternCluster`
  declares its own separate `side: "home" | "away"` literal, not
  importing `TeamSide` — missed by the initial grep-based investigation
  since it doesn't reference `TeamSide` by name. Caught immediately by
  `npm run build` failing after the type widening, fixed in the same
  task.

  Frontend: type-widening only across 6 files (`api.ts`, `App.tsx`,
  `ArenaPanel.tsx` including `ArenaRejection`'s reason union,
  `SignalArchivePanel.tsx`, `SignalCorrelationPanel.tsx`,
  `SteamMoveDetectionPanel.tsx`) — confirmed by inspection that no
  component has a binary `side === "home" ? X : Y` ternary, so
  `"draw"` renders correctly automatically. Explicitly NOT widened:
  `pinnedCaseStudies.ts`'s `PinnedCaseStudySide` (frozen historical
  records, same precedent as the OUTCOME_REJECTED_MOVE rename leaving
  `pinned-case-studies-raw.json` untouched) and any `actionTeam` field
  (a different concept — TXODDS Scores field-event indicator, can't
  legitimately be "draw"). The pre-existing "Market pressure" home/away
  bar in `App.tsx` is a separate, private momentum heuristic unrelated
  to signal `side` — confirmed out of scope during brainstorming, not
  touched.

  6 commits on `main`: `259c0fe` (spec), `101799b` (plan), `dc672a9`
  (TeamSide + 3-way generation + the signalCorrelation.ts fix),
  `3c8cf7a` (settlement), `7979878` (steam detection), `2ac3e85`
  (Contrarian rejection), `78eb9fb` (frontend). Backend: 242 tests pass
  (up from 234 at P1-2 close), clean build. Frontend: clean build,
  verified live in a local dev browser with real accumulated data —
  zero console errors across Arena, Steam Move Detection, and Results
  Settlement panels. No real draw signal has fired locally yet
  (expected, same pattern as P1-2's longshot verification) — live
  confirmation happens whenever one does.

  **Exact next action:** same gate as every prior item — report diff,
  user finds or waits for a real draw signal live in production to
  confirm, then explicitly approves before push and before starting
  P1-7.

  **✅ P1-7 implemented 2026-07-11, awaiting user review before push —
  reframed after data investigation, same pattern as P1-2.** The
  original ask (a 4-stage "event received → market first moved →
  adjustment completed → expected vs observed shift" pipeline) needs
  infrastructure that doesn't exist — a raw field-event stream and a
  raw odds-tick stream correlated in sequence (closer to
  `steamDetection.ts` than `signalEngine.ts`'s single-tick comparison),
  plus a real-data-calibrated expected-shift baseline. Comparable
  scope to P1-1, likely larger given the calibration step. **User
  chose the smaller, already-available proxy metric instead.**

  New `logic/eventLatency.ts`'s `summarizeEventLatency` aggregates the
  gap `scoresContextFreshness.ts` already computes per-signal (with
  `Math.abs()`) between `evidence.scoresContext.timestamp` and
  `evidence.currentTimestamp` into percentile stats
  (`medianGapMs`/`p25GapMs`/`p75GapMs`). **Investigated against real
  archive data first:** of 633 `created`-event archived signals, 314
  (50%) have both timestamps; median gap 3.6s; **102/314 (32%) show a
  negative gap** — not the market reacting before the event, but a
  polling-alignment artifact between the two independently-polled
  feeds (TXODDS Scores, TxLINE odds). Reported honestly via
  `negativeGapCount`/`negativeGapPct`, never filtered out. Every place
  this appears (code comment, `openapi.yaml`, frontend copy) states
  plainly that this is a proxy for event-to-signal gap, not the real
  "market reaction time" pipeline.

  New `GET /api/signal-performance/event-latency` (same family as the
  existing `/api/signal-performance` endpoints), new section in
  `SignalPerformancePanel.tsx` showing the stats with the negative-gap
  caveat as visible text, not a tooltip.

  5 commits on `main`: `1730c79` (spec), `0f6eb25` (plan), `1e88a83`
  (logic + tests), `5d1f241` (route + openapi.yaml), `cbe2caf`
  (frontend). Backend: 247 tests pass (up from 242 at P1-1 close),
  clean build. Frontend: clean build, verified live in a local dev
  browser — renders the expected empty state (local has no Supabase
  credentials, confirmed via `.env`, so the archive-reading endpoint
  correctly fails open to `data: null`), zero console errors. Real
  data confirmation depends on production, which has the actual
  Supabase-backed archive.

  **Exact next action:** same gate as every prior item — report diff,
  user reviews and verifies live in production (where real archived
  data exists), then explicitly approves before push and before
  starting P1-16. **P1-16 is the user-flagged biggest remaining item —
  must scope it carefully and flag realistic effort/risk before
  starting, per their explicit instruction.**

  **✅ P1-16 implemented 2026-07-11, awaiting user review before push
  — scoped down significantly after an explicit risk assessment,
  presented to and approved by the user before any code was written.**
  The original ask was a unified 8-state machine
  (INITIALIZING/SYNCING/STREAMING/ANALYZING/DEGRADED/RECONNECTING/
  CIRCUIT_BREAKER/STOPPED) spanning the whole app. Investigated first:
  this app has three deliberately independent subsystems (the polling
  agent loop, documented as the signal-generation "source of truth,"
  plus two separate SSE monitors, documented as "additive to and
  independent from" it) — the 8 named states are a mix of
  startup-phase concepts, one SSE connection's lifecycle, and a
  processing-state concept that don't map onto one subsystem. Forcing
  them into a single state would misrepresent reality or require three
  separate machines under one banner.

  **User approved the scoped-down version exactly as assessed:** 4
  states (`STREAMING`/`STALE`/`RECONNECTING`/`STOPPED`), applied only
  to the two SSE monitors (`services/sseStreamMonitor.ts`), **not**
  the polling agent loop — confirmed that loop has zero existing
  circuit-breaker substrate today, and adding real behavioral logic
  there this close to the tournament ending was assessed as genuine
  risk to signal generation itself, which the user explicitly agreed
  not to take on. New `deriveStreamStatus` is a pure, read-only
  function over `LiveStreamState`'s already-existing fields plus one
  new `isEnabled` input — no new stored state, no change to actual
  connect/reconnect/backoff control flow. Reuses
  `ODDS_STALE_THRESHOLD_MS` from `feedHealth.ts` (5 minutes) rather
  than inventing a new threshold. Surfaced **backend-only** via
  `GET /api/metrics` — no UI indicator, user-approved decision (an
  internal-observability field doesn't need judge-facing surface, and
  risks alarming a judge during a live demo over a normal reconnect
  blip). `/health` untouched.

  Verified live against a running local dev server: observed the full
  real transition sequence on startup — `RECONNECTING` (not yet
  connected) → `STALE` (connected, no event yet) → `STREAMING`
  (connected, real events arriving, `staleForMs` well under the
  5-minute threshold) — using this project's real TxLINE credentials,
  not a mock.

  4 commits on `main`: `720b628` (spec), `7bdcfe3` (plan), `8d378c4`
  (`deriveStreamStatus` + 6 new tests), `97a7fa1` (route +
  openapi.yaml). Backend: 253 tests pass (up from 247 at P1-7 close),
  clean build. No frontend changes, no changes to `processAgentCycle`/
  `runGuardedAgentCycle` — confirmed exactly as scoped. Reviewed and
  approved by the user, pushed to `main` 2026-07-11.

  **✅ P1-4/P1-5/P1-8/P1-19 revisited 2026-07-11 — all four confirmed,
  zero code changes needed.** Investigated each against real current
  state rather than assumed from the earlier P0-phase finding:
  - **P1-4** (distinguish per-bookmaker vs consensus): confirmed
    not-applicable. Re-verified live: 100 current live signals via
    `GET /api/signals` show exactly one `evidence.bookmaker` value
    (`TXLineStablePriceDemargined`); `txlineClient.ts` still does a
    straight passthrough with zero aggregation logic. Same finding as
    the P0-1/P0-2 triage, unchanged.
  - **P1-5** (coverage/dispersion in confidence scoring):
    confirmed not-applicable, same root cause as P1-4 — "coverage/
    dispersion" is inherently a multi-source concept (how many
    bookmakers reported, how much they disagree); with only one
    consensus price stream, there is no dispersion to compute.
  - **P1-8** (LLM out of core decisions): confirmed true. Zero
    LLM/AI API references anywhere in the codebase (backend or
    frontend, confirmed by grep). The "GoalPulse Analyst Chat"
    feature — the only plausible place one could be hiding — is
    explicitly deterministic: its own UI copy states this
    ("Deterministic analyst replies using the current signals...")
    and its implementation is plain keyword-matching over
    already-computed API data, no external model call.
  - **P1-19** (no large refactor before submission): confirmed not
    violated. Every actual application-code commit this session is
    small and incremental (largest under ~100 lines changed); the one
    3000+ line commit found in the session's git history was a
    docs/plans housekeeping bundle, not a code refactor.

  No spec/plan/implementation cycle for these four — pure
  investigation-and-confirm items, no code diff to review, consistent
  with the P1-13/P1-14 precedent from Tier 1.

  **Exact next action:** the 20 mandatory tests from the PDF's
  Mandatory Test Plan (map each to a real applicable test or mark
  not-applicable with reasoning) and the 15-item Definition of Done
  checklist, per the user's explicit ordering.

- **P1-4, P1-5, P1-8, P1-19 (previously skip-listed):** ✅ done — see
  "P1-4/P1-5/P1-8/P1-19 revisited 2026-07-11" entry above for the full
  verdict on all four (all confirmed, zero code changes needed).

**🔄 20 Mandatory Tests + 15-item Definition of Done — investigation
pass complete 2026-07-11, findings reported to user, AWAITING USER
DECISION on 4 real gaps before any fix is implemented. Full exact
verbatim text of both lists (as pasted by the user from the PDF) is
preserved below for reference by any future session/tool — do not
re-derive or guess these from memory.**

### Mandatory Test Plan (verbatim, PDF page 12)

```
1. Same fixture and selection, different bookmaker: must not create a movement pair.
2. Same fixture and bookmaker, different line value: must not create a movement pair.
3. Same fixture and bookmaker, different market type: must not create a movement pair.
4. Same canonical market key over time: must create the correct movement.
5. One extreme bookmaker outlier: must not create a consensus signal.
6. Consensus with four bookmakers and 75% agreement: may create a qualifying signal.
7. De-vig calculation: probabilities must sum to approximately 1.0.
8. Raw compression and probability-point shift: must be reported separately.
9. Historical tick: must not contain score events later than the tick timestamp.
10. Replay determinism: same input must produce the same ordered decisions and results.
11. Final fixture state change: must not alter earlier historical decisions.
12. Duplicate TxLINE sequence: must be ignored exactly once.
13. Stale odds after a new score event: signal or position must be rejected.
14. Risk limit exceeded: paper position must be rejected with an explicit reason code.
15. Agent restart: persisted state must reload without duplicating open or settled positions.
16. Local SHA-256 fingerprint: must remain separate from Solana verification status.
17. Solana verification failure: must not be reported as verified.
18. Draw-side movement: must be evaluated as a valid three-way selection.
19. Backend correlation endpoint: repeated totals lines from one base match must be deduplicated.
20. End-to-end replay: ingestion to signal to risk to paper execution to settlement without manual intervention.
```

### Definition of Done (verbatim, PDF page 13)

```
1. No movement signal can compare different bookmakers or market identities.
2. The primary movement model uses de-vigged consensus probability.
3. The system reports raw price compression and probability movement separately.
4. Historical replay contains no future score or state leakage.
5. Live mode and replay mode use the same strategy and risk engine.
6. Draw is supported in the three-way market model.
7. Every signal contains deterministic inputs, thresholds, formulas, and reason codes.
8. Every rejected signal contains a precise rejection reason.
9. Every executed signal creates a paper position and later a settlement record.
10. Local audit fingerprint and Solana validation are clearly separated.
11. No label claims a proven trap, manipulation, or smart money without evidence.
12. The agent can complete a replay without human intervention.
13. The demo visibly shows TxLINE data, sequence, timestamps, data freshness, and latency.
14. The public repository has passing CI, pinned dependencies, and a license.
15. The README states current limitations honestly.
```

### Verdicts (investigated against real code and live production data, not assumed)

**Tests 1-3** (cross-bookmaker/line/market pairing): N/A. Verified live via `GET /api/signals` — 100 live signals, exactly one `evidence.bookmaker` value (`TXLineStablePriceDemargined`). `matchId`-scoped comparison (`findPreviousSnapshot(matchId)` in `store.ts`) structurally prevents cross-market pairing since totals signals use a distinct `-totals-<line>` matchId suffix.

**Test 4**: PASS — existing `signalEngine.test.ts` coverage.

**Tests 5-6** (outlier/consensus-agreement): N/A — no multi-bookmaker data exists to test against.

**Test 7 / DoD 2** (de-vig sums to ~1.0): PASS, and a real finding along the way — **TxLINE's feed is de-vigged at the source, not by this codebase.** Verified with real numbers: `1/homeOdds + 1/awayOdds + 1/drawOdds` = 0.9988-1.0001 across two different live matches (fixtures 18213979 and 18237038). Zero de-vig computation exists anywhere in this repo (confirmed by grep) — the "Demargined" in the bookmaker name is TxLINE's own upstream de-margining, passed through as-is.

**Test 9 / DoD 4** (no future score leakage): PASS — already verified during the 2026-07-11 P0-3 triage.

**Test 10** (replay determinism): PASS with one exception — see Gap 1 below. `signalEngine.ts` itself has zero `Date.now()`/`Math.random()` calls (P0-3 finding), but the *replay-specific settlement path* in `server.ts` has a real bug (Gap 1).

**Test 11**: PASS — P0-3: settlement runs strictly after detection, never feeds back into severity/confidence.

**Test 12** (duplicate TxLINE sequence ignored once): PASS — `snapshot.id` is built directly from TxLINE's own `MessageId` (`txlineClient.ts` lines 1066-1068/1120-1122: `` `txline-${match.id}-${odds.Ts}-${odds.MessageId}` ``), and `store.ts`'s `snapshotAlreadyExists` dedupes on this exact id.

**Test 13** (stale odds after score event rejected): PASS — signals are purely price-compression-driven from freshly-polled data each cycle; a stale (unchanged) price produces 0% compression, below the 4% floor, and structurally cannot fire a signal.

**Test 15 / restart dedup**: PASS — Arena positions are computed fresh from `store.signals` at request time every call, never persisted independently, so there is no "duplicate position" risk structurally. Signal-level in-memory dedup already investigated and confirmed solid during P1-18.

**Test 16 / DoD 10** (SHA-256 vs Solana separated): PASS — fixed directly during the 2026-07-11 P0-5 triage (`arena.proof.note` split into two honest, separate claims).

**Test 17** (Solana failure never reported as verified): PASS — `services/onchainValidation.ts` returns `available: false` on every failure path (bad response, exception, etc.); `isValid` is only ever set from a genuine on-chain check when `available: true`. Confirmed by reading the file directly.

**Test 19**: PASS — P1-3, verified live in production the same day.

**Test 20 / DoD 12** (end-to-end replay, no manual intervention): PASS with one exception — see Gap 1. `GET /api/replay/backtest` (`server.ts` line 739 onward) runs ingestion → signal detection → council audit → Arena positions → settlement in one autonomous request/response cycle.

**DoD 1, 4, 5, 7, 9, 11, 13, 14**: PASS — same evidence as the corresponding numbered tests above (DoD 1↔Tests 1-3, DoD 4↔Test 9/11, DoD 5↔both paths call `buildSignalFromSnapshots`, DoD 7↔`signalEngine.ts` inspection, DoD 9↔Arena/settlement pipeline confirmed, DoD 11↔`OUTCOME_REJECTED_MOVE` rename from the P0 triage, DoD 13↔`GET /api/metrics`/`/health`/Guided Tour, DoD 14↔Tier 1's P1-9/P1-10/P1-12).

### 4 real gaps found — reported to user, NONE fixed yet, awaiting decision on priority/scope

**Gap 1 — Draw settlement missing from the replay path (affects Tests 10, 18, 20, DoD 6).**
P1-1 added draw settlement to `store.ts`'s live-cycle `evaluatePendingSignalsForFinishedMatches`, but `server.ts`'s `/api/replay/backtest` route has a **separate, duplicate settlement implementation** that P1-1 did not touch: `settleReplaySignal` (lines 817-836) and `checkScoreReality` (lines 838+) both only check `side === "home"`/`"away"` win conditions. A draw signal replayed through this endpoint always settles `"incorrect"` even on a real drawn final score, and `checkScoreReality`'s `CONFIRMED_BY_SCORE` branch has the identical gap. Straightforward fix, same pattern as P1-1's `store.ts` change (add a `signal.side === "draw" && match.homeScore === match.awayScore` clause to both functions). Note: a third `side === "away" ? "correct" : "incorrect"` check at line 954 is inside the synthetic/pinned demo-dataset fallback path (`useRealReplay` false branch) — not real settlement logic, deliberately not flagged as a bug.

**Gap 2 — No "risk limit exceeded → rejected" mechanism (Test 14, partially DoD 8).**
The only risk-sizing control anywhere is Kelly Criterion's `MAX_STAKE_FRACTION` (`logic/arena.ts`) — it **clamps** the stake to at most 20% of bankroll, it does not **reject** the position. No code path anywhere rejects a paper position outright for exceeding a risk threshold with an explicit reason code. The existing P1-6 rejection-reason mechanism only covers `totals_signal`/`not_market_only_move`/`no_original_snapshot`/`draw_signal` — none risk-limit-based. DoD 8 ("every rejected signal contains a precise reason") is true for the rejections that exist, not true for a risk-limit rejection that doesn't exist.

**Gap 3 — No raw-compression-vs-probability-shift separate reporting (Test 8, DoD 3).**
Now that Test 7 confirms the underlying odds are genuinely de-vigged, computing a probability-point shift (e.g. `1/oddsBefore - 1/oddsAfter`) would be straightforward — but `AgentSignal` only ever carries `oddsChangePct` (raw percentage compression). No probability-point-shift field exists anywhere in the signal, the archive, or any API response.

**Gap 4 — `README.md` is badly stale (DoD 15, indirectly DoD 13).**
Still describes pre-session state: "24 automated unit tests" (actual count is 253 as of P1-16), and only 6 "beyond the core loop" features listed when dozens have shipped this session (Arena's 3rd strategy, Signal Correlation, Confidence Calibration, draw-side signals, the P1-2 longshot penalty, P1-18 idempotency, CI, P1-16 stream status, etc.). Last synced 2026-07-10, predates the entire day-of P0/P1 remediation arc (Tier 1 through P1-16 plus the P1-4/P1-5/P1-8/P1-19 revisits).

**Exact next action for a future session/tool:** present these 4 gaps to the user (already done once in the original session, response pending at time of writing) and get their decision on priority/scope for each before writing any fix — same investigate→brainstorm→spec→plan→implement→review→verify-live gate as every other item this session. Do not silently patch any of these without that conversation happening first, even though Gap 1 in particular is a small, well-understood fix.

📋 Next Steps: implement Tier 1 (see above), report back, wait for
review before Tier 2. All four "future ideas" candidates shipped
2026-07-10 (Historical Pattern Match, Verification Depth Score,
Meta-agent, Skeptic Agent), the Guided Tour now covers all four as of
2026-07-11, and the external P0 review is fully triaged and closed out
as of 2026-07-11 — none of that needs further action.
See "Known limitations" below for the P1 list (CI/dependency
pinning/CORS/LICENSE), deliberately deferred, not implemented. Deferred future option, not scheduled: fix the
totals-line overcounting server-side in `signalCorrelation.ts` (matching
the Signal Performance precedent) rather than the current frontend-only
dedup. `match_archive`'s Supabase setup is already complete (user ran the
`create table` statement directly in the Supabase SQL editor, verified in
the Table Editor — see item #3 in "What still needs doing" below). Await
direction.

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
- **Vercel is now connected to GitHub and auto-deploys on push to `main`**
  (fixed 2026-07-09 — see "Vercel deploy incident" below). Before this fix,
  it had *no* Git connection at all and had been stuck on a manual
  `vercel deploy` CLI snapshot for the entire session; this is now
  resolved and confirmed working end-to-end.
- **Render suspended the backend on 2026-07-10 for exceeding free-tier
  bandwidth** (see "Render bandwidth-suspension incident" below) — fixed
  by adding a card to the Render workspace; service confirmed back to
  "Deployed" and `/health` responding normally. Watch the Render billing
  page for the rest of the month if traffic patterns change.

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
  `marketMaker.ts`, `arena.ts`, `backtest.ts`, `scoresContextFreshness.ts`,
  `councilDissent.ts`, `feedHealth.ts`, `marketConfirmation.ts`,
  `paginationParams.ts`, `steamDetection.ts`, `signalCorrelation.ts`,
  `signalPerformance.ts`
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
`ResultsSettlementPanel`, `SignalArchivePanel`, `SignalPerformancePanel` (new),
`VerifiedCaseStudiesPanel`, `WhatChangedPanel`. No test runner configured —
every panel is verified manually against a running dev server, not via
automated tests.

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
(`Object.is(-0, 0)` is `false`, which Vitest's `toBe()` uses). Shipped
backend-only, no dashboard panel; the frontend wiring gap this left (the
API returned `kellyCriterion` but `ArenaPanel.tsx` never rendered it) was
found and fixed 2026-07-10 — see "ArenaPanel Kelly Criterion wiring gap"
under "Bugs found and fixed" below. Spec:
`docs/superpowers/specs/2026-07-08-arena-kelly-criterion-design.md`,
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

**13. Pattern-matched signal correlation** (`logic/signalCorrelation.ts`'s
`findPatternMatchedClusters`, `GET /api/signal-correlation/patterns`) —
a stricter companion to the existing time-proximity-only signal
correlation (item 6): only reports a cluster when the *same* pattern
(`side`, `severity`, market via the existing `isTotalsSignal` classifier)
repeats across 2+ distinct matches within the same 5-minute window.
`signalType` is excluded from the pattern key since it's already a
deterministic function of `severity`. Confirmed against real production
data before designing this that a homogeneity filter bolted onto the
existing clusters would rarely fire (real clusters mix severities/markets
freely), so this partitions by pattern key first, then reuses the same
session-windowing algorithm independently per partition — that algorithm
was extracted from `findSignalClusters` into a shared, generic
`sessionWindowGroups` helper, regression-tested to confirm zero behavior
change to the existing feature. Route nested under
`/api/signal-correlation/patterns`, distinct from the base endpoint's
response shape. Backend-only, no dashboard panel. Spec:
`docs/superpowers/specs/2026-07-09-pattern-matched-signal-correlation-design.md`,
plan: `docs/superpowers/plans/2026-07-09-pattern-matched-signal-correlation.md`.

**14. Signal Performance dashboard panel**
(`apps/web/src/components/SignalPerformancePanel.tsx`) — surfaces
`GET /api/signal-performance` (item 7), which had zero dashboard
visibility until now. Built directly on the user's own judgment call
("do your best, win this") after the real-time-push track (item 10)
assessed as a firm no-go before the deadline (see
`docs/superpowers/specs/2026-07-09-txlinestream-extension-assessment.md`):
of everything built this session with no UI, historical accuracy per
signal type is the single most persuasive "this system has a real track
record" evidence, so it's the one surfaced first. One card per signal
type, sorted by settled count, color-coded by accuracy threshold.
Confirmed against real production data: WATCH 88% (52 settled),
MOMENTUM_SHIFT 87% (23 settled), SHARP_MOVE only 33% (27 settled) — left
fully visible, not cherry-picked. Spec:
`docs/superpowers/specs/2026-07-09-signal-performance-panel-design.md`,
plan: `docs/superpowers/plans/2026-07-09-signal-performance-panel.md`.

**15. Signal-performance match-diversity metrics**
(`logic/signalPerformance.ts`'s `summarizeSignalTypePerformance`) —
directly motivated by the "Open questions" finding below: investigating
SHARP_MOVE's 33% accuracy found all three signal-type accuracy figures
were 89-100% concentrated in a single match, with nothing in the API
surfacing this. Adds `distinctMatchCount` and `largestMatchSharePct` to
each `SignalTypePerformance` entry, computed from the same
already-settled, already-grouped data. Totals sub-market matchIds
(`<fixtureId>-totals-<line>`) collapse to their base fixture before
counting, so correlated lines on one real match don't inflate the
diversity count — the exact undercounting the manual investigation had to
work around by hand. Backend-only, no dashboard change (per the user's
standing instruction not to add UI without being asked). Spec:
`docs/superpowers/specs/2026-07-09-signal-performance-match-diversity-design.md`,
plan: `docs/superpowers/plans/2026-07-09-signal-performance-match-diversity.md`.

**16. Confidence-bucketed signal performance**
(`logic/signalPerformance.ts`'s `summarizeConfidenceScorePerformance`,
`GET /api/signal-performance/by-confidence`) — tests whether
`confidenceScore` (item #7, designed to be more informative than raw
`severity`/`signalType` by blending in field pressure and freshness)
actually predicts accuracy better. Buckets settled signals by
`confidenceScore` range (`0-25`/`25-50`/`50-75`/`75-100`). **Checked
before building and confirmed with the user: every currently-settled
archived signal predates `confidenceScore`'s introduction, so this
returns `[]` today by design** — accepted deliberately since it's cheap,
well-tested, and will fill in naturally as the remaining tournament
matches settle, without further work. Entries missing `confidenceScore`
are excluded entirely; empty buckets are omitted, not shown as 0%/NaN;
buckets are returned in ascending order (unlike the signalType sibling
function, which has no natural order). Backend-only, no dashboard change.
Spec: `docs/superpowers/specs/2026-07-09-confidence-bucketed-performance-design.md`,
plan: `docs/superpowers/plans/2026-07-09-confidence-bucketed-performance.md`.

**17. Match archive** (`services/archive.ts`'s `archiveMatch`, new
`match_archive` Supabase table) — permanently records every match's
final state the first time it's observed as `"finished"`, independent of
whether it ever produced a signal. `signal_archive` doesn't cover this:
its `signal_data` blob only contains a signal's own fields plus a
scores-context snapshot, never a `Match` object, and only for matches
that produced at least one signal. `store.ts`'s
`upsertRecentFinishedMatches` now returns the matches newly transitioning
to finished on each call (previously `void`); all three of its existing
callers (the live agent cycle, `GET /api/recent-results`,
`GET /api/replay/backtest`) fire `archiveMatch` for each. Insert-only,
fail-open, same conventions as `signal_archive`. A match rediscovered as
finished after a restart (via a backfill route, without the live cycle
having seen the transition) can legitimately produce a second row for
the same `match_id` — accepted by design, not a bug. Write-only for now,
no read endpoint, no dashboard panel, no wiring into Arena's backtest
Contrarian exclusion (item #12's known limitation — a plausible future
beneficiary, not built this round). Spec:
`docs/superpowers/specs/2026-07-10-match-archive-design.md`, plan:
`docs/superpowers/plans/2026-07-10-match-archive.md`.

## Bugs found and fixed

**2026-07-10 — odds movement chart timestamps not chronological**, reported
by user against the live Spain vs Belgium chart (x-axis showing
...07:47, 07:48, 07:47, 07:47...). Root cause: `GET /api/recent-results`
(`server.ts`) re-sorted the *entire* global `store.oddsSnapshots` array
ascending after backfilling finished-match data — but every other reader
(`agent.ts`'s `unshift()`, and the `.slice(0,100).reverse()` pattern in
`/api/odds-stream`, `/api/odds-history`, `/api/live/replay-stream`) assumes
that array stays globally descending (newest-first). Since the endpoint
polls every 5s from the dashboard, it periodically flipped the shared order
mid-flight. The ascending sort's result wasn't even used within that
handler — dead code with a harmful side effect.

Fixed via `mergeOddsSnapshots()` in `store.ts` (dedupe + sort descending,
matching the invariant everywhere else), swapped in for the buggy inline
block (`569bad6`).

**Second instance found while verifying the fix live**: `persistence.ts`'s
`loadSnapshot()` restored `store.oddsSnapshots` straight from Supabase with
no re-sort. A snapshot saved while the above bug was live had out-of-order
`createdAt` values baked in permanently, and got restored verbatim on every
process restart — confirmed live in production immediately after the first
fix's redeploy (France vs Morocco's history came back non-chronological).
Fixed by re-sorting descending on restore, which self-heals any legacy
corrupted data (`95436aa`). Both fixes verified against live production
data (not just local/simulated), including re-checking the specific
previously-corrupted match after the second redeploy.

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

**Vercel deploy incident (2026-07-09, fixed — not a code bug either, but a
much bigger gap than Render's lag).** The Signal Archive and Signal
Performance dashboard panels were confirmed correctly present in `App.tsx`
on `main`, yet neither appeared on the live production frontend
(https://goalpulse-agent.vercel.app). Investigated by fetching the actual
deployed JS bundle and comparing it byte-for-byte against a from-scratch
build of specific historical commits: the live bundle was an *exact* match
for commit `d8f146f` — the commit immediately before the Signal Archive
Panel was even merged, meaning production had been frozen at that point
through every subsequent push (Signal Archive, Signal Performance, and
everything in between).

**Two stacked root causes, both confirmed and fixed directly in the Vercel
dashboard (with user permission):**
1. **The Vercel project had no Git connection at all.** Every prior
   deployment (~20+) was a manual `vercel deploy` CLI run — zero commit
   hashes or branch metadata on any of them. Pushes to `main` were never
   going to trigger anything; there was nothing wired up to receive them.
   Fixed by connecting the Vercel project to GitHub
   (`siey09/goalpulse-agent`) via Project Settings → Git.
2. **Once connected, the first real git-triggered build immediately
   failed:** `sh: line 1: vite: command not found` (exit 127). Project
   Settings → Build and Deployment → Root Directory was unset, defaulting
   to the repo root — the build never `cd`'d into `apps/web`, where `vite`
   (and the rest of the frontend's `node_modules`) actually lives. Fixed
   by setting Root Directory to `apps/web`.

After both fixes, commit `325900e` (an empty commit pushed specifically to
give the newly-connected pipeline something to build) deployed
successfully (Ready, 13s) and was verified live: both panels render
correctly with real production data (Signal Archive: 102 archived,
filters working; Signal Performance: WATCH 88% 46/52, SHARP_MOVE 33%
9/27, MOMENTUM_SHIFT 87% 20/23). **Auto-deploy on push to `main` is now
live going forward** — this class of gap should not recur. Lesson: for
this project specifically, a "the frontend doesn't show a merged feature"
report needs the *hosting pipeline itself* checked, not just the code —
Render's lag and Vercel's total disconnection turned out to be two
completely different failure modes that looked similar from the outside.

**Render bandwidth-suspension incident (2026-07-10, fixed — not a code
bug).** The backend went fully unresponsive. Root cause confirmed via
Render's usage dashboard: the Hobby workspace's free 5GB/month bandwidth
allowance was exhausted (usage showed 6GB/5GB), and "Service-Initiated"
traffic at 5.59GB — not HTTP responses to end users, which were only
421MB — was the overwhelming majority of that usage. Render's documented
behavior: exceeding free bandwidth with no payment method on file
suspends *all* free services for the rest of the calendar month. Left
unresolved, this would have kept the backend down until August 1, past
the July 19 deadline. Fixed by adding a card to the Render workspace;
overage is billed at $0.15/GB (trivially cheap at the current overage —
about $0.15). Service confirmed back to "Deployed" status, and `/health`
on the live endpoint responds `{"ok":true,"status":"running"}`.
`liveStream.connected` was `false` immediately after the restart (an
expected cold-boot state) and was confirmed to reconnect on its own
shortly after. **Flag for the rest of the tournament:**
"Service-Initiated" bandwidth (TxLINE's own push-stream/outbound traffic)
is the dominant cost driver here, not user/judge traffic — if usage
patterns change (more frequent polling, more push-stream volume), watch
the Render billing page for the rest of the month to avoid a repeat
before the 19th.

**ArenaPanel Kelly Criterion wiring gap (2026-07-10, found and fixed —
real user/judge-facing bug).** `GET /api/arena` has returned three agent
scoreboards (`momentumFollower`, `contrarian`, `kellyCriterion`) since
item #11 (Kelly Criterion) merged, but `ArenaPanel.tsx`'s response type
only declared the first two and never rendered the third — Kelly
Criterion's results were computed correctly server-side but silently
dropped from the live dashboard the entire time. Fixed by adding
`kellyCriterion`/`stakeUnits`/the `kelly_criterion` agent id to the
frontend's local types, adding a third `ScoreboardCard` (violet accent),
switching the grid to three columns, generalizing the leader-detection
logic from a two-way ternary to an n-way max-with-uniqueness check across
all three scoreboards, and updating the panel's heading/description to
name all three agents. Verified with a clean `npm run build` in
`apps/web`. Item #11 in the feature list above (previously "backend-only,
no dashboard panel") is now dashboard-wired.

**Investigated 2026-07-10 — TxLINE scores-stream gzip compression already
active, no code change needed.** User proposed adding `Accept-Encoding: gzip`
+ manual `gunzipSync()` decompression to `txlineStream.ts` per TxLINE's
Streaming Data docs (claimed 70-80% bandwidth reduction), motivated by the
Render bandwidth-suspension incident above. Verified empirically before
writing any code: (1) Node's native `fetch()` already sends
`Accept-Encoding: gzip, deflate` by default on every request, confirmed with
a local test server using `txlineStream.ts`'s exact custom-headers shape;
(2) `fetch()` already auto-decompresses gzip/deflate transparently, even
when reading via the streaming `getReader()` API — confirmed locally;
(3) checked the **live** TxLINE endpoint directly:
`/api/scores/stream` already responds with `content-encoding: deflate` by
default, and `content-encoding: gzip` when explicitly requested — compression
has been active in production this whole time, with zero code changes.
Manually adding `gunzipSync()` on top of this would have **broken the
stream** (gunzipping already-decompressed text). Measured the real
wire-bytes reduction directly against the live endpoint (raw `https`
request, comparing `identity` vs `gzip` `Accept-Encoding` over a 45s
window): 33% reduction, likely an underestimate since traffic was sparse
keepalive-only during the test window (gzip's ~18-byte per-frame overhead
eats into savings on tiny frames); real event payloads during live match
action should show savings closer to TxLINE's claimed 70-80%. **No action
needed — do not re-investigate.**

## Known limitations (documented, deliberately not fixed)

- ~~Stale-finished-match repolling~~ **Fixed 2026-07-09** — see
  `docs/superpowers/specs/2026-07-08-stale-finished-match-repolling-fix-design.md`.
  This bullet used to describe the bug as unfixed; it was closed out and
  this note was stale until now.
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
- **P1 items from the 2026-07-11 external technical review, deliberately
  deferred, not implemented:** no CI workflow (tests/build run manually
  each session, not on push/PR), dependencies aren't pinned to exact
  versions (several `package.json` entries use `latest`), CORS is not
  restricted to specific origins, no `LICENSE` file at the repo root.
  All reasonable, none deadline-critical with ~8 days left before
  July 19 — revisit only if there's spare time after everything else is
  stable, not before.

## Open questions (investigated 2026-07-09, revisit later — do not re-investigate from scratch)

**Signal-type accuracy on the dashboard's Signal Performance panel is not
yet statistically meaningful — it's currently one match, sliced three
ways.** Investigated after the panel showed SHARP_MOVE at 33% accuracy
(WATCH 88%, MOMENTUM_SHIFT 87%) and it looked like a real calibration
problem. Findings:

- **No settlement or labeling bug.** Verified `evaluatePendingSignalsForFinishedMatches`
  directly — settlement compares `signal.side`/`signal.target` against the
  real final score, with zero dependency on `severity`/`signalType`.
- **Severe match concentration, not calibration.** Of the settled signals
  behind these three numbers, one single match (Switzerland vs Colombia,
  fixture `18202783`, decided in extra time) accounts for **89% of
  SHARP_MOVE's 27**, **98.1% of WATCH's 52**, and **100% of
  MOMENTUM_SHIFT's 23** settled signals. All three accuracy figures are
  currently describing *one match's outcome*, sliced by severity across
  its 1X2 market and several totals sub-markets (which are themselves
  correlated, not independent trials) — not three diversified track
  records. WATCH/MOMENTUM_SHIFT's high numbers are not yet confirmed as a
  genuine reliable baseline any more than SHARP_MOVE's low number is
  confirmed as a genuine miscalibration.
- **A real, plausible (not yet confirmed) pattern worth re-checking once
  diversified:** a sampled SHARP_MOVE signal showed a 56.73% compression
  toward a side while the match's own field-event context came from the
  *other* side — the signal's own generated text flagged "Caution: the
  latest field event came from the home side, not the signal side," and it
  settled incorrect. `getSeverity()` (which decides SHARP_MOVE/HIGH
  labeling) looks at raw odds-compression magnitude only — it never
  consults field pressure, reliability, or this kind of direction
  mismatch, even though `confidenceScore`/`momentumScore` already compute
  exactly that data elsewhere in the pipeline for other purposes. This is
  a plausible real gap, but on n=3 real matches (2 of them contributing
  only 1-2 signals each) it cannot be distinguished from one dramatic
  match's noise.
- **Timing note:** all currently-settled SHARP_MOVE signals predate the
  stale-finished-match repolling fix (merged 2026-07-09); zero have
  settled since, so whether that fix changes anything here is unknown yet.

**Recommendation (agreed with user): do not patch `getSeverity()` or any
threshold based on this data.** Revisit once settled signals span more
matches (the tournament has ~4 left before July 19) and check whether the
large-compression/field-pressure-mismatch pattern holds up across
genuinely independent matches, rather than one. If it does, that's when a
severity/confidence-blending change would be justified — not before.

**Follow-up shipped (item 15):** `GET /api/signal-performance` now reports
`distinctMatchCount`/`largestMatchSharePct` per signal type, so this exact
concentration check is visible from the API itself going forward — no
need to manually cross-reference archive entries by hand again.

## Future ideas — all four shipped 2026-07-10

Four candidate novel-mechanism ideas discussed 2026-07-10, all now
built and verified live. Backlog closed.

~~1. **Historical Pattern Match**~~ **Shipped 2026-07-10** — see the
entry above.

~~2. **Verification Depth Score**~~ **Shipped 2026-07-10** — see the
entry above.

~~3. **Meta-agent**~~ **Shipped 2026-07-10** — see the entry above.

~~4. **Skeptic Agent**~~ **Shipped 2026-07-10** — see the entry above.

## Testing

**216 tests across 20 files**, all passing, `npm run test` from `apps/api/`:
`agent.test.ts`, `logic/arena.test.ts`, `logic/backtest.test.ts`,
`logic/councilDissent.test.ts`, `logic/feedHealth.test.ts`,
`logic/historicalPatternMatch.test.ts`, `logic/marketConfirmation.test.ts`,
`logic/marketMaker.test.ts`, `logic/paginationParams.test.ts`,
`logic/scoresContextFreshness.test.ts`, `logic/signalCorrelation.test.ts`,
`logic/signalEngine.test.ts`, `logic/signalPerformance.test.ts`,
`logic/steamDetection.test.ts`, `middleware/apiKeyAuth.test.ts`,
`services/archive.test.ts`, `services/persistence.test.ts`,
`services/txlineClient.test.ts`, `store.test.ts`.
Build: `npm run build` (`tsc`), currently clean. Convention: pure logic gets
unit tests with plain objects/mocks; anything requiring a real
TxLINE/Supabase connection is explicitly *not* automated (this environment
has no real credentials for either) — verified instead by the user directly
against production.

**26 backend routes total**, all documented in `openapi.yaml` (validate with
`npx @redocly/cli lint openapi.yaml`): `/health`, `/api/matches`,
`/api/signals`, `/api/stats`, `/api/pnl`, `/api/agent-runs`,
`/api/odds-history`, `/api/recent-results`, `/api/market-maker`,
`/api/arena`, `/api/arena/backtest`, `/api/archive`,
`/api/archive/similar-signals`, `/api/feed-health`,
`/api/market-maker/confirmations`, `/api/steam-moves`,
`/api/signal-correlation`, `/api/signal-correlation/patterns`,
`/api/signal-performance`, `/api/signal-performance/by-confidence`,
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
3. ~~`match_archive` table~~ **Done (2026-07-10)** — see item #17 above.
   The user ran its `create table if not exists` statement (in
   `apps/api/supabase-schema.sql`) directly in the Supabase SQL editor and
   verified it in the Table Editor: `match_archive` appears alongside
   `signal_archive` and `store_snapshots`. Completed right after the table
   was designed, before the dashboard-visibility panels work started. Done
   via the Supabase dashboard directly, not through code — won't show up
   in git history, which is expected, not a gap.
4. ~~Stale-finished-match repolling fix~~ **Done (2026-07-08)** — a new
   `filterOutConfirmedFinishedFixtures(fixtures, priorMatchesById)` in
   `txlineClient.ts`, called in `fetchTxLineFeed()` before
   `prioritizeLikelyLiveFixtures()` runs, excludes any fixture already
   confirmed `finished` in the previous cycle's `store.matches` — no new
   data-fetching needed, since `agent.ts` doesn't overwrite `store.matches`
   until after `fetchTxLineFeed()` returns. Spec:
   `docs/superpowers/specs/2026-07-08-stale-finished-match-repolling-fix-design.md`,
   plan: `docs/superpowers/plans/2026-07-08-stale-finished-match-repolling-fix.md`.
5. ~~Cosmetic: orphaned worktree directories~~ **Not actually present** —
   checked `.claude/worktrees/` directly (2026-07-08): only `agent-arena`
   exists, which is legitimately in active use by a different Claude Code
   session. This note was stale.
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
