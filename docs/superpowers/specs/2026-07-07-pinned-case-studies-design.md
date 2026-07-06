# Pinned Verified Case Studies + Small-Sample Disclaimer

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

GoalPulse Agent's backend store (`apps/api/src/store.ts`) is in-memory only and resets
on every Render restart/redeploy. The two flagship case studies used in the hackathon
narrative — Colombia vs Ghana (validated move, 2 correct signals) and Canada vs Morocco
(confirmed Smart Money Trap, 2 incorrect signals correctly flagged `CONFIRMED_TRAP` /
`EXTREME_REVERSAL`) — were captured live on 2026-07-04/05 and have **already been lost**
from the live store after a subsequent restart (confirmed by checking the live
`/api/signals` endpoint on 2026-07-06: neither match appears anymore).

Separately, the live `strategyAccuracy` number is currently based on a very small
sample (5 closed signals) and fluctuates significantly run to run. If the demo video is
recorded at an unlucky moment, the on-screen accuracy number can look worse than the
strategy's real, already-verified track record, without any honest context for a judge.

This spec covers a combined fix for both problems:

1. Pin the 4 real, verbatim-captured signals from the July 4/5 session so they survive
   any future backend restart, in a dedicated, clearly-labeled panel.
2. Add an always-visible small-sample disclaimer next to the live accuracy number and
   in the P&L card, pointing to the pinned panel for permanent, verified evidence.

## Goals

- The 4 pinned case studies render correctly regardless of backend uptime/restarts.
- The pinned data is never mixed into live aggregate stats (`strategyAccuracy`, P&L) —
  it must stay honestly separate from the live, fluctuating numbers.
- A judge watching the live dashboard can immediately tell the difference between
  "live, small-sample, noisy" and "historical, verified, permanent" evidence.
- No changes to existing live-signal components' internals (risk containment, 12 days
  from deadline).

## Non-goals

- Not building a general-purpose persistence layer for the live store (out of scope;
  the live store's volatility is accepted as-is for this task).
- Not updating the Judge Guide tour steps to reference the new panel (fast-follow,
  not required for this task).
- Not adding a new test framework to `apps/web` (no frontend tests exist today).

## Data source and provenance

- `pinned-case-studies-raw.json` (repo root) is the immutable raw evidence file,
  provided by the user, captured verbatim from live production `/api/signals`
  responses on 2026-07-04/05, before the store reset. **This file is not edited or
  moved** — it remains the permanent, unaltered provenance record.
- A new canonical, typed copy is created at `apps/web/src/data/pinnedCaseStudies.ts`,
  derived from the raw file with exactly one field rename: `outcomeAuditLabel` →
  `trapStatus`, to match the field name already used elsewhere in the frontend
  (`App.tsx` already checks `signal.trapStatus === "CONFIRMED_TRAP"`). No other values
  are altered.

## Architecture

The pinned case studies are **frontend-only**, with no backend involvement:

- `apps/web/src/data/pinnedCaseStudies.ts` exports a typed constant array,
  `PINNED_CASE_STUDIES`, imported directly by the new component at build time.
- No `fetch`, no API call, no loading state, no error state. The panel renders
  identically whether the Render backend is up, cold-starting, or fully down, because
  Vercel serves the frontend as a static build independent of Render's uptime.
- **Guarantee:** this data never touches `store.signals` on the backend and is never
  read by `getStats()` or `getPnlSummary()`. The live `strategyAccuracy` and P&L numbers
  remain exactly as live and unaffected as they are today; the pinned panel is
  additive and fully isolated.

## Component: `VerifiedCaseStudiesPanel.tsx`

New file: `apps/web/src/components/VerifiedCaseStudiesPanel.tsx`.

Follows the existing per-panel convention in this codebase (each panel component
defines its own local, minimal type rather than importing a shared one — see
`SignalIntelligencePanel.tsx` and `ResultsSettlementPanel.tsx` for precedent).

Renders:

- A header: "Verified Case Studies — Permanent Record."
- A one-line provenance caption sourced from the raw file's `provenance` field,
  explaining these are pinned, git-committed evidence that survive backend restarts.
- One card per pinned case study (4 total), showing:
  - Match, target, signal type, severity
  - Odds before → after, `oddsChangePct`
  - `resultStatus` (Correct / Incorrect), styled consistently with existing
    `resultStatus` badges elsewhere in the app
  - For the 2 Canada vs Morocco entries: `trapStatus`, `trapScore`, `reversalRisk`,
    styled consistently with the existing Smart Money Trap Detector card treatment
    in `App.tsx` (red/rose accent, "Trap score N" badge)
  - An evidence block: `fixtureId`, `messageId`, `bookmaker`, `endpointUsed`,
    scoreline, score breakdown (h1/h2/total/corners/yellow cards), reliability —
    styled consistently with the existing `AuditRow`/`EvidenceRow` patterns
- The section root has `id="verified-case-studies"` so other elements can
  `scrollIntoView` to it.

## Placement in `App.tsx`

Inserted in the main content flow immediately after `<ResultsSettlementPanel />` and
before `<WhatChangedPanel />`, grouping it with the other audit/evidence panels rather
than the live activity ticker:

```
<SignalIntelligencePanel />
<ResultsSettlementPanel />
<VerifiedCaseStudiesPanel />   {/* new */}
<WhatChangedPanel />
```

## Disclaimer integration

Two always-visible locations, both reading existing state already present in
`App.tsx` (`stats`, `pnl`) — no new data fetching:

1. **Accuracy tile** (header stat card): a small caption below the existing
   percentage, e.g. `n={stats.closedSignals} closed trades — too small to be
   statistically meaningful · See verified case studies`, clickable to scroll to
   `#verified-case-studies`.
2. **P&L card**: one added line under the existing `pnl.note` text, e.g.
   `Based on {pnl.settledBets} settled bet(s) — see verified case studies for
   permanently confirmed historical examples`, same click-through behavior.

Both captions are always rendered (not conditionally hidden past a sample-size
threshold), per explicit decision during design.

## Error handling

None required. The pinned data is a static, type-checked TypeScript module — it
cannot fail to load, cannot be empty unexpectedly, and has no network dependency.

## Testing / verification

- `npm run build` in `apps/web` (clean TypeScript compile) as the primary check.
- Manual check on the local dev server: confirm the new panel renders all 4 case
  studies correctly, confirm both disclaimer captions render and their click-through
  scroll behavior works.
- No new automated frontend test framework is introduced (none exists in `apps/web`
  today); this is consistent with the existing project testing footprint.

## Alternatives considered (rejected)

**Approach B — extend `ResultsSettlementPanel` with a pinned sub-section instead of a
new component.** Rejected: couples static, never-changing pinned data with a component
that actively polls live `/api/matches`/`/api/signals` every 30s, increasing the risk
surface of an already fairly dense (368-line) file this close to the deadline.

**Approach C — extract a shared `EvidenceCard`/`AuditRow` component used by both the
new panel and existing ones.** Rejected: touches existing, working live components to
avoid a modest amount (~40 lines) of duplicated display JSX. Premature abstraction for
a one-off panel; the risk isn't justified by the benefit 12 days from the deadline.

## Follow-ups (not in scope for this task)

- Update the Judge Guide tour (`judgeDemoSteps` in `App.tsx`) to include a step
  pointing at the new panel.
- Idea #2 (Discord alert visibility) and #3 (Over/Under market badges) are queued as
  separate, subsequent design/implementation passes.
- Idea #4 (dynamic on-chain verification) is on hold pending the user's own
  verification of whether TxLINE's stat-validation endpoint generalizes to other live
  fixtures.
