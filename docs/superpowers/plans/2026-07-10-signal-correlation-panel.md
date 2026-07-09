# Signal Correlation Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, self-contained dashboard panel that fetches
`GET /api/signal-correlation/patterns`, dedupes each cluster's matches by
real fixture (stripping the `-totals-<line>` suffix), filters out
single-match artifacts, and shows only genuine cross-match pattern
clusters — without touching any existing panel or backend endpoint.

**Architecture:** One new React component (`SignalCorrelationPanel.tsx`)
following `ConfidenceCalibrationPanel.tsx`'s one-shot-fetch convention,
plus a client-side dedup/filter step matching the existing `baseMatchId`
helper pattern from `signalPerformance.ts`, plus a two-line addition to
`App.tsx` (import + render) placed after `ConfidenceCalibrationPanel`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite. No new
dependencies.

## Global Constraints

- Pure frontend additions only — do not modify any existing panel/component
  file, and do not modify `apps/api` (the dedup fix is client-side per the
  user-confirmed design decision, not a backend change).
- No new npm dependencies.
- Reuse existing colors/patterns/card shell — do not invent new visual
  tokens.
- No frontend test runner exists in `apps/web` — verification is
  `npm run build` (runs `tsc -b && vite build`) plus `npm run lint`, both
  must be clean.
- Full spec: `docs/superpowers/specs/2026-07-10-signal-correlation-panel-design.md`.

---

### Task 1: Create the `SignalCorrelationPanel` component

**Files:**
- Create: `apps/web/src/components/SignalCorrelationPanel.tsx`

**Interfaces:**
- Produces: `export function SignalCorrelationPanel()` — zero-props React
  component, named export.
- Consumes: nothing from other tasks. Fetches
  `GET {API_BASE_URL}/api/signal-correlation/patterns` where
  `API_BASE_URL` is
  `import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com"`.
  Live response shape today (`payload.data` is `PatternCluster[]`):
  ```json
  {
    "data": [
      {
        "side": "home",
        "severity": "LOW",
        "market": "totals",
        "matchIds": ["18218149-totals-4.5", "18213979-totals-4.5"],
        "matchCount": 2,
        "signalCount": 2,
        "windowStart": "2026-07-09T18:15:16.055Z",
        "windowEnd": "2026-07-09T18:18:55.284Z",
        "spanMs": 219229,
        "signalIds": ["signal-..."]
      }
    ],
    "summary": { "signalsScanned": 100, "patternClustersDetected": 7 }
  }
  ```
  This example cluster is genuine (2 distinct real matches). Most clusters
  in production right now are NOT genuine — see Task 1 Step 1's dedup
  logic, which must run on every cluster before rendering.

- [ ] **Step 1: Write the component file**

```tsx
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type PatternCluster = {
  side: "home" | "away";
  severity: "HIGH" | "MEDIUM" | "LOW";
  market: "1x2" | "totals";
  matchIds: string[];
  matchCount: number;
  signalCount: number;
  windowStart: string;
  windowEnd: string;
  spanMs: number;
  signalIds: string[];
};

type GenuineCluster = PatternCluster & { realMatchIds: string[] };

function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}

function distinctRealMatches(matchIds: string[]): string[] {
  return Array.from(new Set(matchIds.map(baseMatchId)));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function severityClass(severity: PatternCluster["severity"]) {
  if (severity === "HIGH") return "border-red-400/20 bg-red-400/10 text-red-200";
  if (severity === "MEDIUM") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-sky-400/20 bg-sky-400/10 text-sky-200";
}

export function SignalCorrelationPanel() {
  const [clusters, setClusters] = useState<GenuineCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadCorrelation() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-correlation/patterns`);

        if (!response.ok) throw new Error("Unable to load signal correlation");

        const payload = await response.json();

        if (!isActive) return;

        const raw: PatternCluster[] = Array.isArray(payload.data) ? payload.data : [];

        const genuine: GenuineCluster[] = raw
          .map((cluster) => ({
            ...cluster,
            realMatchIds: distinctRealMatches(cluster.matchIds),
          }))
          .filter((cluster) => cluster.realMatchIds.length >= 2);

        setClusters(genuine);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load signal correlation", error);
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadCorrelation();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Cross-match analysis</p>
          <h2 className="text-xl font-semibold text-white">Signal correlation</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <Link2 className="h-3.5 w-3.5" />
          Pattern matched
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading signal correlation...
          </div>
        ) : clusters.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No cross-match signal patterns detected yet.
          </div>
        ) : (
          clusters.map((cluster, index) => (
            <div
              key={`${cluster.windowStart}-${index}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${severityClass(cluster.severity)}`}
                >
                  {cluster.side} · {cluster.severity} · {cluster.market}
                </span>
                <span className="text-sm font-semibold text-white">
                  {cluster.realMatchIds.length} real matches
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {cluster.signalCount} signals over {formatDuration(cluster.spanMs)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cluster.realMatchIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-stone-400"
                  >
                    Match {id}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the `Link2` icon is exported by the installed `lucide-react` version**

Run: `ls apps/web/node_modules/lucide-react/dist/esm/icons/ | grep -i "^link2"`
Expected: `link-2.mjs` or `link2.mjs` listed. If the exact name differs
from `Link2`, check
`grep -i "export.*Link" apps/web/node_modules/lucide-react/dist/esm/lucide-react.mjs`
for the correct exported name and use that instead (in both the import
and JSX). If no Link-family icon is found at all, swap for `Activity`
(already proven — used in `MarketMakerPanel.tsx`).

- [ ] **Step 3: Type-check the new file in isolation**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors referencing `SignalCorrelationPanel.tsx`.

- [ ] **Step 4: Manually verify the dedup/filter logic against live data**

Run:
```bash
curl -s https://goalpulse-agent-api.onrender.com/api/signal-correlation/patterns
```
For each cluster in the response's `data` array, manually strip
`-totals-<line>` from each `matchId`, dedupe, and count. Confirm the
component's `distinctRealMatches`/filter logic (Step 1) would keep only
clusters with 2+ distinct base match IDs. At spec-writing time this was
exactly 1 surviving cluster (the `18218149`/`18213979` pair) out of 7 raw
clusters — if today's live number differs, that's fine (real data changes
over time), but the *logic* must still correctly separate genuine
clusters from single-match artifacts. This is a manual correctness check,
not an automated test (no frontend test runner exists).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/SignalCorrelationPanel.tsx
git commit -m "$(cat <<'EOF'
Add SignalCorrelationPanel component

Self-contained panel rendering GET /api/signal-correlation/patterns,
deduped by real match and filtered to genuine cross-match clusters
client-side. Not yet wired into App.tsx.
EOF
)"
```

---

### Task 2: Wire the panel into `App.tsx` and verify the full build

**Files:**
- Modify: `apps/web/src/App.tsx:11` (import block, after the
  `ConfidenceCalibrationPanel` import)
- Modify: `apps/web/src/App.tsx:2332` (panel grid, immediately after
  `<ConfidenceCalibrationPanel />`)

**Interfaces:**
- Consumes: `SignalCorrelationPanel` from Task 1
  (`./components/SignalCorrelationPanel`), zero props.
- Produces: nothing consumed by later tasks — last task in the plan.

- [ ] **Step 1: Add the import**

In `apps/web/src/App.tsx`, line 11 currently reads:

```tsx
import { ConfidenceCalibrationPanel } from "./components/ConfidenceCalibrationPanel";
```

Add immediately after it:

```tsx
import { SignalCorrelationPanel } from "./components/SignalCorrelationPanel";
```

- [ ] **Step 2: Render the panel**

In `apps/web/src/App.tsx`, around line 2332, the panel grid currently
reads:

```tsx
          <ConfidenceCalibrationPanel />

          <VerifiedCaseStudiesPanel />
```

Change to:

```tsx
          <ConfidenceCalibrationPanel />

          <SignalCorrelationPanel />

          <VerifiedCaseStudiesPanel />
```

Do not modify any other line in this file.

- [ ] **Step 3: Run the full build**

Run: `cd apps/web && npm run build`
Expected: exits 0, no TypeScript or Vite errors.

- [ ] **Step 4: Run lint**

Run: `cd apps/web && npm run lint`
Expected: exits 0 beyond the known pre-existing baseline (2 errors/1
warning in `App.tsx`'s unrelated dashboard-loading effects — see the
prior two panels' plans for the same finding). No *new* problems.

- [ ] **Step 5: Manually smoke-test against the live backend**

Run: `cd apps/web && npm run dev`, open the printed local URL, confirm:
- The new "Signal correlation" card renders after "Confidence
  calibration" and before "Verified Case Studies", styled consistently
  with neighboring panels.
- It shows either genuine cluster cards (correctly deduped — cross-check
  against Task 1 Step 4's manual count) or the "No cross-match signal
  patterns detected yet." empty state — not a blank card, not stuck on
  "Loading...", no console fetch errors.
- No other panel changed appearance or behavior.

Stop the dev server afterward by killing its exact PID (use
`Get-NetTCPConnection -LocalPort <port> -State Listen` to find it) — don't
use a broad pattern-based kill.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
Wire SignalCorrelationPanel into the dashboard

Mounted after ConfidenceCalibrationPanel; no changes to any existing
panel.
EOF
)"
```

---

## After this plan

Per the session's stated workflow: present the diff to the user for
review, merge to `main` on approval, push, run backend tests + both
package builds to confirm `main` is still green, then the user verifies
the panel live in production
(`https://goalpulse-agent.vercel.app`). This is the last of the three
prioritized panels from the 2026-07-10 brainstorm — update
`PROJECT_STATE.md` to reflect the dashboard-visibility initiative as
complete once verified live.
