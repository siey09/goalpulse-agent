# Confidence Calibration Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, self-contained dashboard panel that renders
`GET /api/signal-performance/by-confidence`, showing accuracy climbing
alongside confidence bucket, without touching any existing panel.

**Architecture:** One new React component (`ConfidenceCalibrationPanel.tsx`)
following the exact conventions of the existing `SignalPerformancePanel.tsx`
(self-contained fetch, local types, Tailwind-only, no new deps), plus a
two-line addition to `App.tsx` (import + render) to mount it.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite. No new
dependencies.

## Global Constraints

- Pure additions only — do not modify any existing panel/component file.
- No new npm dependencies, no chart library — CSS-only bars.
- Reuse existing colors/patterns (emerald-300/amber-300/rose-300 accuracy
  thresholds, `h-2 rounded-full` bar pattern) — do not invent new visual
  tokens.
- No frontend test runner exists in `apps/web` — verification is
  `npm run build` (runs `tsc -b && vite build`) plus `npm run lint`, both
  must be clean.
- Full spec: `docs/superpowers/specs/2026-07-10-confidence-calibration-panel-design.md`.

---

### Task 1: Create the `ConfidenceCalibrationPanel` component

**Files:**
- Create: `apps/web/src/components/ConfidenceCalibrationPanel.tsx`

**Interfaces:**
- Produces: `export function ConfidenceCalibrationPanel()` — a zero-props
  React component, default-exported nowhere (named export only, matching
  `SignalPerformancePanel`'s convention).
- Consumes: nothing from other tasks. Fetches
  `GET {API_BASE_URL}/api/signal-performance/by-confidence` directly,
  where `API_BASE_URL` is `import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com"`
  (same fallback constant every other panel in this codebase uses). Live
  response shape today:
  ```json
  {
    "data": [
      { "bucket": "0-25", "settledCount": 3, "correctCount": 1, "incorrectCount": 2, "accuracyPct": 33 }
    ],
    "summary": { "settledSignalsScanned": 12, "bucketsReported": 1 }
  }
  ```
  (`data` may contain 0 to 4 entries; the component only reads `data`, not
  `summary`.)

- [ ] **Step 1: Write the component file**

```tsx
import { useEffect, useState } from "react";
import { Target } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type ConfidenceBucketPerformance = {
  bucket: "0-25" | "25-50" | "50-75" | "75-100";
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};

function accuracyBarClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "bg-emerald-300";
  if (accuracyPct >= 50) return "bg-amber-300";
  return "bg-rose-300";
}

function accuracyTextClass(accuracyPct: number) {
  if (accuracyPct >= 70) return "text-emerald-300";
  if (accuracyPct >= 50) return "text-amber-300";
  return "text-rose-300";
}

export function ConfidenceCalibrationPanel() {
  const [buckets, setBuckets] = useState<ConfidenceBucketPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadCalibration() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance/by-confidence`);

        if (!response.ok) throw new Error("Unable to load confidence calibration");

        const payload = await response.json();

        if (!isActive) return;

        const data: ConfidenceBucketPerformance[] = Array.isArray(payload.data)
          ? payload.data
          : [];

        setBuckets(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load confidence calibration", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadCalibration();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Calibration check</p>
          <h2 className="text-xl font-semibold text-white">Confidence calibration</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <Target className="h-3.5 w-3.5" />
          Score vs. accuracy
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading confidence calibration...
          </div>
        ) : buckets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Not enough settled, confidence-scored signals yet.
          </div>
        ) : (
          buckets.map((entry) => (
            <div key={entry.bucket} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Confidence {entry.bucket}
                </span>
                <span className={`text-sm font-semibold ${accuracyTextClass(entry.accuracyPct)}`}>
                  {entry.accuracyPct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/15">
                <div
                  className={`h-2 rounded-full ${accuracyBarClass(entry.accuracyPct)}`}
                  style={{ width: `${entry.accuracyPct}%` }}
                />
              </div>
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

- [ ] **Step 2: Confirm `Target` icon is exported by the installed `lucide-react` version**

Run: `grep -c "export.*Target" apps/web/node_modules/lucide-react/dist/esm/lucide-react.js`
Expected: a nonzero count. If zero, swap `Target` for `TrendingUp` (already
proven to work — used in `SignalPerformancePanel.tsx`) in both the import
and JSX.

- [ ] **Step 3: Type-check the new file in isolation**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors referencing `ConfidenceCalibrationPanel.tsx`. (This
project has no other frontend files mid-edit, so any remaining errors here
belong to this new file — fix them before proceeding.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ConfidenceCalibrationPanel.tsx
git commit -m "$(cat <<'EOF'
Add ConfidenceCalibrationPanel component

Self-contained panel rendering GET /api/signal-performance/by-confidence,
not yet wired into App.tsx.
EOF
)"
```

---

### Task 2: Wire the panel into `App.tsx` and verify the full build

**Files:**
- Modify: `apps/web/src/App.tsx:9` (import block)
- Modify: `apps/web/src/App.tsx:2326` (panel grid, immediately after
  `<SignalPerformancePanel />`)

**Interfaces:**
- Consumes: `ConfidenceCalibrationPanel` from Task 1
  (`./components/ConfidenceCalibrationPanel`), zero props.
- Produces: nothing consumed by later tasks — this is the last task in the
  plan.

- [ ] **Step 1: Add the import**

In `apps/web/src/App.tsx`, line 9 currently reads:

```tsx
import { SignalPerformancePanel } from "./components/SignalPerformancePanel";
```

Add immediately after it:

```tsx
import { ConfidenceCalibrationPanel } from "./components/ConfidenceCalibrationPanel";
```

- [ ] **Step 2: Render the panel**

In `apps/web/src/App.tsx`, around line 2326, the panel grid currently
reads:

```tsx
          <SignalPerformancePanel />

          <VerifiedCaseStudiesPanel />
```

Change to:

```tsx
          <SignalPerformancePanel />

          <ConfidenceCalibrationPanel />

          <VerifiedCaseStudiesPanel />
```

Do not modify any other line in this file.

- [ ] **Step 3: Run the full build**

Run: `cd apps/web && npm run build`
Expected: exits 0, no TypeScript or Vite errors. This runs `tsc -b` across
the whole project, so it will also catch anything Task 1's isolated
type-check missed.

- [ ] **Step 4: Run lint**

Run: `cd apps/web && npm run lint`
Expected: exits 0, no new lint errors (pre-existing warnings in untouched
files, if any, are not this task's concern).

- [ ] **Step 5: Manually smoke-test against the live backend**

Run: `cd apps/web && npm run dev`, open the printed local URL, confirm:
- The new "Confidence calibration" card renders somewhere after "Signal
  performance" in the panel grid, styled consistently with neighboring
  panels.
- It shows either real bucket rows (bars, percentages, correct/settled
  counts) or the "Not enough settled, confidence-scored signals yet."
  empty state — not a blank card, not a crash, not `Loading...` stuck
  forever (confirm in the browser console there's no fetch error).
- No other panel changed appearance or behavior.

Stop the dev server afterward (Windows: kill the exact PID, don't use a
broad pattern-based kill — other stray dev servers may be running).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
Wire ConfidenceCalibrationPanel into the dashboard

Mounted after SignalPerformancePanel; no changes to any existing panel.
EOF
)"
```

---

## After this plan

Per the session's stated workflow: present the diff to the user for
review, merge to `main` on approval, push, then verify the panel live in
production (`https://goalpulse-agent.vercel.app`, confirming it renders
real data against the live Render backend) before starting the next panel
(Steam Move Detection). Update `PROJECT_STATE.md` once verified live.
