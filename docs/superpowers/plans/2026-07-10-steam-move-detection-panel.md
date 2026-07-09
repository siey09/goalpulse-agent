# Steam Move Detection Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, self-contained dashboard panel that polls
`GET /api/steam-moves` every 5 seconds and shows any currently-detected
steam move, without touching any existing panel.

**Architecture:** One new React component (`SteamMoveDetectionPanel.tsx`)
following `MarketMakerPanel.tsx`'s live-polling convention (poll every
5000ms, mounted-guard, `clearInterval` on unmount), plus a two-line
addition to `App.tsx` (import + render) placed after `MarketMakerPanel`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite. No new
dependencies.

## Global Constraints

- Pure additions only — do not modify any existing panel/component file.
- No new npm dependencies.
- Reuse existing colors/patterns (orange-300/orange-200 market-movement
  accent, existing chip style, existing card shell) — do not invent new
  visual tokens.
- No frontend test runner exists in `apps/web` — verification is
  `npm run build` (runs `tsc -b && vite build`) plus `npm run lint`, both
  must be clean.
- Full spec: `docs/superpowers/specs/2026-07-10-steam-move-detection-panel-design.md`.

---

### Task 1: Create the `SteamMoveDetectionPanel` component

**Files:**
- Create: `apps/web/src/components/SteamMoveDetectionPanel.tsx`

**Interfaces:**
- Produces: `export function SteamMoveDetectionPanel()` — zero-props React
  component, named export (matching every other panel's convention).
- Consumes: nothing from other tasks. Polls
  `GET {API_BASE_URL}/api/steam-moves` where `API_BASE_URL` is
  `import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com"`
  (same fallback every other panel uses). Live response shape today:
  ```json
  { "data": [], "summary": { "matchesScanned": 24, "steamMovesDetected": 0 } }
  ```
  When non-empty, each `data` entry has the shape:
  ```json
  {
    "matchId": "string",
    "match": "Colombia vs Ghana",
    "side": "home",
    "tickCount": 3,
    "totalMovePct": 4.2,
    "windowMs": 192000,
    "firstOdds": 1.59,
    "lastOdds": 1.52,
    "firstTickAt": "2026-07-10T12:00:00.000Z",
    "lastTickAt": "2026-07-10T12:03:12.000Z"
  }
  ```

- [ ] **Step 1: Write the component file**

```tsx
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type SteamMove = {
  matchId: string;
  match: string;
  side: "home" | "away";
  tickCount: number;
  totalMovePct: number;
  windowMs: number;
  firstOdds: number;
  lastOdds: number;
  firstTickAt: string;
  lastTickAt: string;
};

type SteamMoveSummary = {
  matchesScanned: number;
  steamMovesDetected: number;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function SteamMoveDetectionPanel() {
  const [moves, setMoves] = useState<SteamMove[]>([]);
  const [summary, setSummary] = useState<SteamMoveSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadSteamMoves() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/steam-moves`);
        const payload = (await response.json()) as {
          data?: SteamMove[];
          summary?: SteamMoveSummary;
        };

        if (!isActive) return;

        setMoves(payload.data ?? []);
        setSummary(payload.summary ?? null);
      } catch (error) {
        console.error("Failed to load steam moves", error);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadSteamMoves();

    const timer = window.setInterval(loadSteamMoves, 5000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#120d09]/90 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500">Live market scan</p>
          <h2 className="text-xl font-semibold text-white">Steam move detection</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
          <Zap className="h-3.5 w-3.5" />
          {summary ? `${summary.matchesScanned} matches scanned` : "Scanning"}
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            Loading steam moves...
          </div>
        ) : moves.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-400">
            No steam move happening right now — scanning every 5s.
          </div>
        ) : (
          moves.map((move) => (
            <div key={move.matchId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{move.match}</span>
                <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200">
                  {move.side}
                </span>
              </div>
              <p className="text-2xl font-semibold text-orange-300">
                {move.firstOdds.toFixed(2)} &rarr; {move.lastOdds.toFixed(2)}
                <span className="ml-2 text-sm font-semibold text-orange-200">
                  ({move.totalMovePct}%)
                </span>
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {move.tickCount} consecutive ticks over {formatDuration(move.windowMs)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the `Zap` icon is exported by the installed `lucide-react` version**

Run: `ls apps/web/node_modules/lucide-react/dist/esm/icons/ | grep -i "^zap"`
Expected: `zap.mjs` listed. If not found, swap `Zap` for `Activity`
(already proven — used in `MarketMakerPanel.tsx`) in both the import and
JSX.

- [ ] **Step 3: Type-check the new file in isolation**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors referencing `SteamMoveDetectionPanel.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SteamMoveDetectionPanel.tsx
git commit -m "$(cat <<'EOF'
Add SteamMoveDetectionPanel component

Self-contained panel polling GET /api/steam-moves every 5s, not yet
wired into App.tsx.
EOF
)"
```

---

### Task 2: Wire the panel into `App.tsx` and verify the full build

**Files:**
- Modify: `apps/web/src/App.tsx:3` (import block, after the
  `MarketMakerPanel` import)
- Modify: `apps/web/src/App.tsx:2319` (panel grid, immediately after
  `<MarketMakerPanel />`)

**Interfaces:**
- Consumes: `SteamMoveDetectionPanel` from Task 1
  (`./components/SteamMoveDetectionPanel`), zero props.
- Produces: nothing consumed by later tasks — last task in the plan.

- [ ] **Step 1: Add the import**

In `apps/web/src/App.tsx`, line 3 currently reads:

```tsx
import { MarketMakerPanel } from "./components/MarketMakerPanel";
```

Add immediately after it:

```tsx
import { SteamMoveDetectionPanel } from "./components/SteamMoveDetectionPanel";
```

- [ ] **Step 2: Render the panel**

In `apps/web/src/App.tsx`, around line 2319, the panel grid currently
reads:

```tsx
          <MarketMakerPanel />

          <ArenaPanel />
```

Change to:

```tsx
          <MarketMakerPanel />

          <SteamMoveDetectionPanel />

          <ArenaPanel />
```

Do not modify any other line in this file.

- [ ] **Step 3: Run the full build**

Run: `cd apps/web && npm run build`
Expected: exits 0, no TypeScript or Vite errors.

- [ ] **Step 4: Run lint**

Run: `cd apps/web && npm run lint`
Expected: exits 0. The pre-existing 2 errors/1 warning in `App.tsx`
(`react-hooks/set-state-in-effect` around the dashboard-loading effects,
unrelated to this change — see the confidence-calibration panel's plan
for the same finding) are not this task's concern; confirm no *new*
problems appear beyond that known baseline.

- [ ] **Step 5: Manually smoke-test against the live backend**

Run: `cd apps/web && npm run dev`, open the printed local URL, confirm:
- The new "Steam move detection" card renders after "Live bid/ask quotes"
  (`MarketMakerPanel`) and before the Arena panel, styled consistently
  with neighboring panels.
- It shows either real steam-move cards or the
  "No steam move happening right now — scanning every 5s." empty state —
  not a blank card, not stuck on "Loading...", no console fetch errors.
- Watch it for at least one 5-second poll cycle (e.g. via Network tab or
  console) to confirm it's actually re-fetching, not just fetching once.
- No other panel changed appearance or behavior.

Stop the dev server afterward by killing its exact PID (use
`Get-NetTCPConnection -LocalPort <port> -State Listen` to find it) — don't
use a broad pattern-based kill, since stray dev servers may already be
running on this machine.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
Wire SteamMoveDetectionPanel into the dashboard

Mounted after MarketMakerPanel; no changes to any existing panel.
EOF
)"
```

---

## After this plan

Per the session's stated workflow: present the diff to the user for
review, merge to `main` on approval, push, run backend tests + both
package builds to confirm `main` is still green, then the user verifies
the panel live in production
(`https://goalpulse-agent.vercel.app`) before deciding whether to build
the third, stretch-priority panel (Signal Correlation). Update
`PROJECT_STATE.md` once verified live.
