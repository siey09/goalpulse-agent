# Signal Performance Dashboard Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `SignalPerformancePanel.tsx`, surfacing `GET /api/signal-performance`'s real historical accuracy per signal type, and wire it into the dashboard.

**Architecture:** A single new component following the exact conventions established by `SignalArchivePanel.tsx` this session (self-fetching, zero props, local types, Tailwind-only). No backend changes — the endpoint already exists and is live.

**Tech Stack:** React 19, TypeScript, Tailwind v4.

**Full design reference:** `docs/superpowers/specs/2026-07-09-signal-performance-panel-design.md`

## Global Constraints

- Zero props, self-contained — matches every existing panel.
- No shared frontend types file — local types in the component file.
- No new dependencies.
- No filters/pagination/polling — small, fixed dataset, aggregate not live.
- Color thresholds: `accuracyPct >= 70` emerald, `>= 50` amber, `< 50` rose.
- Sort by `settledCount` descending.
- No automated tests — verify via clean build + the already-confirmed live API response shape (matches this session's established approach for the one other frontend feature).
- This repo's docs must reflect this feature once merged.

---

### Task 1: `SignalPerformancePanel.tsx` component and wiring

**Files:**
- Create: `apps/web/src/components/SignalPerformancePanel.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/signal-performance` (existing, live in production).
- Produces: `export function SignalPerformancePanel()`.

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/SignalPerformancePanel.tsx`:

```typescript
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SignalTypePerformance = {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};

function accuracyClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "text-emerald-300";
  if (accuracyPct >= 50) return "text-amber-300";
  return "text-rose-300";
}

export function SignalPerformancePanel() {
  const [performance, setPerformance] = useState<SignalTypePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadPerformance() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance`);

        if (!response.ok) throw new Error("Unable to load signal performance");

        const payload = await response.json();

        if (!isActive) return;

        const data: SignalTypePerformance[] = Array.isArray(payload.data)
          ? [...payload.data].sort((a, b) => b.settledCount - a.settledCount)
          : [];

        setPerformance(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal performance", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadPerformance();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Track record</p>
          <h2 className="text-xl font-semibold text-white">Signal performance</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <TrendingUp className="h-3.5 w-3.5" />
          Historical accuracy
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading signal performance...
          </div>
        ) : performance.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No settled signals yet.
          </div>
        ) : (
          performance.map((entry) => (
            <div
              key={entry.signalType}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {entry.signalType}
              </p>
              <p className={`mt-2 text-3xl font-semibold ${accuracyClass(entry.accuracyPct)}`}>
                {entry.accuracyPct}%
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {entry.correctCount} / {entry.settledCount} correct
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

Find:

```typescript
import { SignalArchivePanel } from "./components/SignalArchivePanel";
```

Replace with:

```typescript
import { SignalArchivePanel } from "./components/SignalArchivePanel";
import { SignalPerformancePanel } from "./components/SignalPerformancePanel";
```

Find:

```tsx
          <SignalArchivePanel />
```

Replace with:

```tsx
          <SignalArchivePanel />

          <SignalPerformancePanel />
```

- [ ] **Step 3: Verify the project builds**

```bash
cd apps/web && npm run build
```

Expected: clean build (`tsc -b && vite build`), no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SignalPerformancePanel.tsx apps/web/src/App.tsx
git commit -m "Add Signal Performance dashboard panel"
```

---

### Task 2: Docs update

**Files:**
- Modify: `PROJECT_STATE.md`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

- [ ] **Step 1: Update the docs**

In `TECHNICAL_DOCS.md`'s "Composite Confidence Score and Signal-Type
Performance" section, add a note that this data is now rendered on the
dashboard via `SignalPerformancePanel.tsx`, replacing any "no dashboard
panel" phrasing there.

In `README.md`/`SUBMISSION_NOTES.md`, note the new panel alongside the
existing Signal Archive panel mention.

In `PROJECT_STATE.md`, add a brief dated entry and update the handoff
status block.

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Document the Signal Performance dashboard panel"
```
