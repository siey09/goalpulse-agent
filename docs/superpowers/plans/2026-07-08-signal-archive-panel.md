# Signal Archive Dashboard Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `SignalArchivePanel.tsx`, a self-contained frontend panel that reads the existing `GET /api/archive` endpoint with real pagination and filter controls, and wire it into the dashboard.

**Architecture:** A single new component following this codebase's established panel convention exactly (self-fetching, zero props, local types, Tailwind-only styling), rendered inline in `App.tsx` alongside the other historical/settlement panels. No backend changes — `GET /api/archive` already exists and is live in production with 247+ real entries.

**Tech Stack:** React 19, TypeScript, Tailwind v4, `lucide-react` icons. No test runner exists in `apps/web` (confirmed: no vitest/jest/testing-library dependency) — verification is manual, in-browser, matching how every existing panel was built and verified.

**Full design reference:** `docs/superpowers/specs/2026-07-08-signal-archive-panel-design.md`

## Global Constraints

- Zero props, self-contained component — matches every existing panel (`ArenaPanel`, `WhatChangedPanel`, etc.).
- No shared frontend types file — types are declared locally inside `SignalArchivePanel.tsx`, matching the existing per-component convention.
- No new dependencies — Tailwind classes only, no dropdown/table/date libraries. `lucide-react`'s `Archive`/`Search` icons only (both confirmed to exist in the installed package).
- Default `eventFilter` is `"settled"` (confirmed design decision) — one row per fully-resolved signal by default; a visible pill lets the user switch to `"created"`/`"all"`.
- `matchIdFilter` is debounced 400ms before triggering a fetch, since it drives a server-side query (unlike the existing client-side `searchTerm` in `App.tsx`).
- Any filter change resets `page` back to `1`.
- No polling interval for this panel — archive history doesn't need live 5s refresh.
- No automated tests for this task — verify manually against a running `npm run dev` dev server, matching every existing panel's own verification method.
- This repo's docs (`PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`) must reflect this feature once merged.

---

### Task 1: `SignalArchivePanel.tsx` component

**Files:**
- Create: `apps/web/src/components/SignalArchivePanel.tsx`

**Interfaces:**
- Consumes: `GET /api/archive` (existing, live in production — query params `page`, `pageSize`, `matchId`, `status`, `market`, `event`; response shape `{ data: ArchiveEntry[], pagination: { page, pageSize, totalCount, totalPages } }`, confirmed directly against production).
- Produces: `export function SignalArchivePanel()` — consumed by Task 2 (`App.tsx`).

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/SignalArchivePanel.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Archive, Search } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

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

type StatusFilter = "all" | "pending" | "correct" | "incorrect";
type MarketFilter = "all" | "1x2" | "totals";
type EventFilter = "settled" | "created" | "all";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultStatusClass(status: ArchiveEntry["resultStatus"]) {
  if (status === "correct") return "text-emerald-300";
  if (status === "incorrect") return "text-rose-300";
  return "text-amber-300";
}

function severityClass(severity: string) {
  if (severity === "HIGH") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (severity === "MEDIUM") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (severity === "LOW") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-black/20 text-stone-400";
}

export function SignalArchivePanel() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [pagination, setPagination] = useState<ArchivePagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [matchIdInput, setMatchIdInput] = useState("");
  const [matchIdFilter, setMatchIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("settled");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMatchIdFilter(matchIdInput);
      setPage(1);
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [matchIdInput]);

  useEffect(() => {
    let isActive = true;

    async function loadArchive() {
      try {
        setIsLoading(true);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", "25");
        if (matchIdFilter.trim()) params.set("matchId", matchIdFilter.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (marketFilter !== "all") params.set("market", marketFilter);
        if (eventFilter !== "all") params.set("event", eventFilter);

        const response = await fetch(
          `${API_BASE_URL}/api/archive?${params.toString()}`
        );

        if (!response.ok) throw new Error("Unable to load archive");

        const payload = await response.json();

        if (!isActive) return;

        setEntries(Array.isArray(payload.data) ? payload.data : []);
        setPagination(payload.pagination ?? null);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal archive", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadArchive();

    return () => {
      isActive = false;
    };
  }, [page, matchIdFilter, statusFilter, marketFilter, eventFilter]);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Permanent history</p>
          <h2 className="text-xl font-semibold text-white">Full tournament archive</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
          <Archive className="h-3.5 w-3.5" />
          {pagination ? `${pagination.totalCount} archived` : "Loading"}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm text-stone-400">
        <Search className="h-4 w-4" />
        <input
          value={matchIdInput}
          onChange={(event) => setMatchIdInput(event.target.value)}
          className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-500"
          placeholder="Filter by match ID"
        />
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["all", "pending", "correct", "incorrect"] as const).map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold capitalize transition ${
              statusFilter === status
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["all", "1x2", "totals"] as const).map((market) => (
          <button
            key={market}
            onClick={() => {
              setMarketFilter(market);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold uppercase transition ${
              marketFilter === market
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {market}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-black/20 p-1">
        {(["settled", "created", "all"] as const).map((eventOption) => (
          <button
            key={eventOption}
            onClick={() => {
              setEventFilter(eventOption);
              setPage(1);
            }}
            className={`rounded-xl px-2 py-2 text-[10px] font-semibold capitalize transition ${
              eventFilter === eventOption
                ? "bg-orange-400/15 text-orange-200"
                : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
            }`}
          >
            {eventOption}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading archive...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No archived signals match these filters.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={`${entry.signalId}-${entry.event}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">
                  {entry.signalData?.match ?? entry.matchId}
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold ${resultStatusClass(entry.resultStatus)}`}
                >
                  {entry.resultStatus}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${severityClass(entry.severity)}`}
                >
                  {entry.severity}
                </span>
                <span>{entry.signalType}</span>
                <span>
                  {entry.side} → {entry.signalData?.target ?? "?"}
                </span>
                <span>{entry.oddsChangePct}%</span>
                <span className="ml-auto text-stone-500">{formatDate(entry.archivedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-semibold disabled:opacity-30"
          >
            Prev
          </button>

          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            disabled={page >= pagination.totalPages}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-semibold disabled:opacity-30"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds with no type errors**

```bash
cd apps/web && npm run build
```

Expected: clean build (`tsc -b && vite build`), no type errors, `dist/`
produced.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SignalArchivePanel.tsx
git commit -m "Add SignalArchivePanel component"
```

---

### Task 2: Wire into `App.tsx` and verify in the browser

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `SignalArchivePanel` (Task 1, `./components/SignalArchivePanel`).
- Produces: the live panel rendered on the dashboard — nothing consumed by later tasks except Task 3's docs.

- [ ] **Step 1: Add the import**

In `apps/web/src/App.tsx`, find:

```typescript
import { WhatChangedPanel } from "./components/WhatChangedPanel";
```

Replace with:

```typescript
import { WhatChangedPanel } from "./components/WhatChangedPanel";
import { SignalArchivePanel } from "./components/SignalArchivePanel";
```

- [ ] **Step 2: Render the panel**

Find this exact block:

```tsx
          <ResultsSettlementPanel />

          <VerifiedCaseStudiesPanel />

          <WhatChangedPanel />
```

Replace with:

```tsx
          <ResultsSettlementPanel />

          <SignalArchivePanel />

          <VerifiedCaseStudiesPanel />

          <WhatChangedPanel />
```

- [ ] **Step 3: Verify the project builds with no type errors**

```bash
cd apps/web && npm run build
```

Expected: clean build (`tsc -b && vite build`), no type errors, `dist/`
produced.

- [ ] **Step 4: Manual verification in the browser**

Start the frontend dev server:

```bash
cd apps/web && npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) in a browser.
Since `VITE_API_BASE_URL` isn't set locally, the panel points at the live
production API (`https://goalpulse-agent-api.onrender.com`) by default —
this is expected and desired here, since it's the only place with real
archived data (247+ entries) to verify against.

Confirm all of the following:
- The "Full tournament archive" panel renders below Results Settlement,
  showing a non-zero "N archived" count in its header badge.
- Entries display with a match name, side/target, signal type, severity
  badge, colored result status, odds change %, and a formatted timestamp.
- By default the `event` pill shows "settled" active, and no signal
  appears to visibly repeat back-to-back.
- Clicking the "created" or "all" event pills changes the results (and
  resets to page 1).
- Typing a partial match ID into the search box narrows results after
  the debounce (roughly 400ms after you stop typing) — try a substring
  from one of the visible match IDs.
- Clicking through the `status` and `market` pills filters results
  correctly and resets to page 1.
- If `pagination.totalPages > 1`, the Prev/Next buttons appear, Prev is
  disabled on page 1, Next is disabled on the last page, and clicking
  Next/Prev changes the visible entries and the "Page X of Y" text.
- Filtering down to a combination with zero matches shows "No archived
  signals match these filters." instead of an empty blank area.

Stop the dev server afterward (Ctrl+C in that terminal, or find its PID
via `netstat -ano | grep ":5173.*LISTENING"` on Windows and confirm the
command line before stopping it, matching this repo's established
dev-server hygiene).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "Render SignalArchivePanel on the dashboard"
```

---

### Task 3: Final verification and docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: everything from Tasks 1-2 (this task only verifies and documents; no new production code).
- Produces: nothing further — this is the last task in the plan.

- [ ] **Step 1: Re-run the full build**

```bash
cd apps/web && npm run build
```

Expected: clean build (`tsc -b && vite build`), no type errors, `dist/`
produced.

- [ ] **Step 2: Update the docs**

In `TECHNICAL_DOCS.md`, find the "Insert-Only Signal Archive" section
(documents `GET /api/archive`) and add a sentence noting the frontend
panel now exists (`apps/web/src/components/SignalArchivePanel.tsx`),
replacing any "no dashboard panel exists yet" phrasing there with a
description of what the panel shows (paginated, filterable by
matchId/status/market/event, defaults to settled-only). Add
`components/SignalArchivePanel.tsx` to the frontend file list if one
exists in that doc.

In `SUBMISSION_NOTES.md`, add a new numbered entry under "Major Features
Added This Session" (continuing from "11. Retroactive Arena Backtesting
Against the Archive") describing the panel: what it shows, the
settled-by-default decision and why, and that this is the session's first
actual frontend feature (everything else was backend-only) — a genuine,
worth-noting shift in scope for this entry specifically.

In `README.md`, add a line noting the archive panel under whatever
feature-list bullet already mentions the archive read endpoint.

In `PROJECT_STATE.md`:
- Update `## What still needs doing` item 2 (Signal archive dashboard
  panel) to reflect it's now done — change the bullet to past tense,
  reference `apps/web/src/components/SignalArchivePanel.tsx` and this
  plan/spec's file paths.
- Update the handoff status block per the standing update-cadence
  instruction: mark this panel done, and note whatever's next (per the
  user's own priority list: the stale-finished-match repolling fix, or
  await further direction).

- [ ] **Step 3: Commit the docs update**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document the Signal Archive dashboard panel across project docs"
```

- [ ] **Step 4: Request final whole-branch review**

Per this repo's established convention, request a final review of the
entire branch's diff (all 3 tasks' commits together) before merging to
`main` — do not merge without it.
