# Signal Archive Dashboard Panel Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

`GET /api/archive` (built earlier this session) has been live in production
since before this session's later work, with 247+ real entries accumulated
and growing — but nothing on the frontend surfaces it. It's the one
feature from this session still missing its UI, and per explicit user
priority, closing this gap now outweighs further backend depth given the
July 19 deadline.

## Scope and priority (confirmed with user)

The panel should demonstrate the archive's actual differentiator — a
**permanent, queryable historical record** surviving beyond the in-memory
caps — not just a static recent-signals list. It needs real pagination and
filter controls, not just a read-only feed.

## Handling duplicate rows (confirmed with user)

The archive stores raw event-log rows: a signal appears twice (`created`,
then `settled`) under the same `signalId`. Defaulting the panel's `event`
filter to `settled` (one row per fully-resolved signal) avoids a
first-time viewer seeing the same signal twice back-to-back and mistaking
it for a bug — while a visible `event` filter pill still lets someone
switch to `created`/`all` to see the raw log.

## Component: `apps/web/src/components/SignalArchivePanel.tsx`

Follows this codebase's established panel convention exactly (confirmed
via investigation of `ArenaPanel.tsx`/`WhatChangedPanel.tsx`): a
self-contained component, zero props, imported and rendered inline in
`App.tsx` — no shared state, no context, no prop drilling. Placed near
`ResultsSettlementPanel`/`VerifiedCaseStudiesPanel` (historical/settlement
section), not near the live-trading panels.

**Local types** (matching the codebase's convention of no shared
frontend/backend type file — every panel redeclares its own shape):

```typescript
type ArchiveEntry = {
  signalId: string;
  event: "created" | "settled";
  matchId: string;
  side: "home" | "away";
  signalType: string;
  severity: string;
  resultStatus: "pending" | "correct" | "incorrect";
  momentumScore: number;
  oddsChangePct: number;
  archivedAt: string;
  signalData?: {
    match?: string;
    target?: string;
    explanation?: string;
    confidenceScore?: number;
  };
};

type ArchivePagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};
```

**State:**
- `entries: ArchiveEntry[]`, `pagination: ArchivePagination | null`
- `page: number` (1-indexed, resets to 1 whenever any filter changes)
- `matchIdFilter: string` (free-text, debounced 400ms before triggering a
  fetch — this is the first panel whose search box drives a *server*
  query rather than a client-side filter over already-loaded data, since
  archive results are paginated server-side; a debounce avoids firing a
  request per keystroke)
- `statusFilter: "all" | "pending" | "correct" | "incorrect"` (default `"all"`)
- `marketFilter: "all" | "1x2" | "totals"` (default `"all"`)
- `eventFilter: "settled" | "created" | "all"` (default `"settled"`, per
  the confirmed decision above)
- `isLoading: boolean`, simple boolean per the existing convention

**Fetching:** Plain `fetch()` inside a `useEffect` keyed on
`[page, matchIdFilter debounced, statusFilter, marketFilter, eventFilter]`,
with a mounted-guard matching every other panel. Builds the query string
conditionally (`status`/`market` omitted entirely when `"all"`, `event`
omitted when `"all"` since the backend's own filter parsing already
treats an absent param as "no filter" — mirroring
`parseArchiveFilters`'s exact semantics rather than sending a redundant
`event=all` the backend wouldn't recognize). No polling interval — this
is historical data, not live odds; it only refetches on filter/page
changes.

**Filter UI** (no dropdown/table-library precedent exists anywhere in this
codebase yet — this establishes the pattern for both pagination and
multi-field filtering, staying consistent with the existing pill-button/
search-input aesthetic rather than introducing new UI primitives):
- A free-text `<input>` for `matchId`, styled like the existing search box
- Pill-button rows (matching the existing `matchStatusFilter` toggle
  pattern in `App.tsx`) for `status`, `market`, and `event` — each a row
  of small toggle buttons, active state highlighted

**Pagination UI:** Prev/Next buttons plus a "Page X of Y" text indicator
(`pagination.page`/`pagination.totalPages`), disabling Prev at page 1 and
Next at the last page. No page-number list — Prev/Next is sufficient
given `totalPages` can be large (247 entries / 25 per page ≈ 10 pages
today, growing).

**Row display:** Each entry as a compact card, one per row:
- `signalData?.match` (human-readable "Team A vs Team B"), falling back to
  raw `matchId` if `signalData` is missing
- `side`/`signalData?.target`
- `signalType` and `severity` as small badges
- `resultStatus`, color-coded exactly matching the existing convention
  found in `ArenaPanel.tsx`: `correct` → `text-emerald-300`, `incorrect` →
  `text-rose-300`, `pending` → `text-amber-300`
- `severity` badge color (new mapping, no exact existing precedent found):
  `HIGH` → rose, `MEDIUM` → amber, `LOW` → sky, `NONE` → stone/muted
- `oddsChangePct` (formatted as `${value}%`)
- `archivedAt` formatted via `new Date(...).toLocaleString()` — matching
  the codebase's plain-`Date`/no-library convention

**Empty/loading/error states:** Simple text blocks matching every other
panel — "Loading archive..." while loading, "No archived signals match
these filters." when `entries.length === 0` post-load, errors
`console.error`'d (no new error-banner convention introduced, matching
the established pattern of panels not having their own error UI).

## `App.tsx` change

One import line and one `<SignalArchivePanel />` render line, placed
adjacent to `ResultsSettlementPanel`/`VerifiedCaseStudiesPanel` in the
existing single-page layout — no new routing, no new section-nav entry
required (though adding one is a one-line addition if desired during
implementation, matching how other sections are wired via `id`+
`goToSection()`).

## Testing

This is the session's first frontend feature; the existing test suite is
entirely backend (`apps/api`). No frontend test runner is configured in
`apps/web` (confirmed via `package.json` — no vitest/jest/testing-library
dependency). Consistent with the rest of this codebase's frontend, this
panel is verified via manual browser testing against the running dev
server (`npm run dev` in `apps/web`, pointed at either local or production
`API_BASE_URL`), not automated tests — matching how every other existing
panel component was verified. The implementation plan's task steps will
include explicit manual-verification steps (load the panel, exercise each
filter, confirm pagination Prev/Next, confirm the settled-by-default
event filter, confirm empty/loading states) rather than automated test
steps.

## Out of scope (explicitly deferred)

- No new shared frontend types file — matches the existing
  per-component-redeclaration convention; introducing a shared types
  module is a larger refactor outside this feature's scope.
- No dropdown/select components or table library — deliberately kept
  consistent with the existing hand-rolled pill/input aesthetic.
- No live-polling refresh for this panel — archive history doesn't need
  it, unlike the live-odds panels.
- No `match_archive` table work — a separately deferred, unrelated item
  in `PROJECT_STATE.md`.
