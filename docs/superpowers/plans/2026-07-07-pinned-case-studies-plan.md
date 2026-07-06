# Pinned Case Studies + Small-Sample Disclaimer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the 4 real July 4/5 signals (Colombia vs Ghana, Canada vs Morocco) as a permanent, git-committed, frontend-only panel that survives Render backend restarts, and add an always-visible small-sample disclaimer next to the live accuracy number and P&L card.

**Architecture:** A new typed data file (`apps/web/src/data/pinnedCaseStudies.ts`) bundled directly into the Vercel-hosted frontend build, rendered by a new standalone component (`VerifiedCaseStudiesPanel.tsx`), mounted in `App.tsx` after `ResultsSettlementPanel`. Two small disclaimer captions are added to existing `App.tsx` UI, both linking to the new panel via `scrollIntoView`. No backend changes, no new data fetching, no new test framework.

**Tech Stack:** React 19, TypeScript ~6.0, Vite 8, Tailwind CSS 4, lucide-react (existing stack, no new dependencies).

## Global Constraints

- No backend changes of any kind (spec: "Architecture & data flow").
- `pinned-case-studies-raw.json` at the repo root must never be edited or moved — it is the immutable raw provenance record (spec: "Data source and provenance").
- The only permitted field transformation from the raw file is renaming `outcomeAuditLabel` → `trapStatus`; no other values may be altered (spec: "Data source and provenance").
- No new frontend test framework is introduced; verification is `npm run build` in `apps/web` plus manual dev-server checks (spec: "Testing / verification").
- The new component and data file must be fully standalone — do not modify the internals of `ResultsSettlementPanel.tsx` or `SignalIntelligencePanel.tsx`, and do not extract any shared evidence-row/card component (spec: "Alternatives considered", Approach A is the chosen approach; B and C were explicitly rejected).
- Both disclaimer captions are always rendered, not conditionally hidden past a sample-size threshold (spec: "Disclaimer integration").
- New panel must be inserted immediately after `<ResultsSettlementPanel />` and before `<WhatChangedPanel />` in `App.tsx` (spec: "Placement in App.tsx").

---

### Task 1: Create the pinned case study data file

**Files:**
- Create: `apps/web/src/data/pinnedCaseStudies.ts`

**Interfaces:**
- Produces: `export type PinnedCaseStudy`, `export const PINNED_CASE_STUDIES: PinnedCaseStudy[]` (exactly 4 entries), `export const PINNED_CASE_STUDIES_PROVENANCE: string`. Task 2 imports all three from this file.

- [ ] **Step 1: Create the data file with full types and the 4 verbatim case studies**

Create `apps/web/src/data/pinnedCaseStudies.ts` with this exact content (values copied from `pinned-case-studies-raw.json` at the repo root, with only `outcomeAuditLabel` renamed to `trapStatus` on the two Canada vs Morocco entries — no other values changed):

```typescript
export type PinnedCaseStudySide = "home" | "away";

export type PinnedCaseStudyScoreBreakdown = {
  h1?: string;
  h2?: string;
  total?: string;
  goals?: string;
  corners?: string;
  redCards?: string;
  yellowCards?: string;
};

export type PinnedCaseStudyScoresContext = {
  fixtureId: string;
  latestAction: string;
  actionLabel: string;
  actionTeam: "home" | "away" | "neutral" | "unknown";
  statusId: number;
  statusName: string;
  clockSeconds: number;
  minute: number;
  homeScore: number;
  awayScore: number;
  scoreline: string;
  scoreBreakdown: PinnedCaseStudyScoreBreakdown;
  possessionType?: string;
  pressureLevel: "NONE" | "SAFE" | "ATTACK" | "DANGER" | "HIGH_DANGER";
  fieldPressureScore: number;
  reliability: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  confirmed?: boolean;
  sequence: number;
};

export type PinnedCaseStudyEvidence = {
  source: "txline";
  fixtureId: string;
  endpointUsed: string;
  bookmaker: string;
  messageId: string;
  marketType: string;
  scoresContext: PinnedCaseStudyScoresContext;
};

export type PinnedCaseStudy = {
  id: string;
  matchId: string;
  match: string;
  target: string;
  side: PinnedCaseStudySide;
  signalType: "SHARP_MOVE" | "MOMENTUM_SHIFT";
  severity: "HIGH" | "MEDIUM";
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore: number;
  explanation: string;
  resultStatus: "correct" | "incorrect";
  trapStatus?: "CONFIRMED_TRAP";
  trapScore?: number;
  reversalRisk?: "EXTREME_REVERSAL";
  evidence: PinnedCaseStudyEvidence;
};

export const PINNED_CASE_STUDIES_PROVENANCE =
  "Captured verbatim from live production /api/signals responses on 2026-07-04/2026-07-05 during manual verification, before the in-memory store reset on a later Render restart. This is a faithful copy of real API output, not a reconstruction from memory.";

export const PINNED_CASE_STUDIES: PinnedCaseStudy[] = [
  {
    id: "signal-18179549-txline-18179549-1783129507735-1836215980:00003:000163-10021-stab-home",
    matchId: "18179549",
    match: "Colombia vs Ghana",
    target: "Colombia",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 1.59,
    oddsAfter: 1.19,
    oddsChangePct: 25.16,
    momentumScore: 25.54,
    explanation:
      "Colombia odds compressed by 25.16% from 1.59 to 1.19. The agent flags this as a high-severity sharp movement. The move has moderate field context from a Attack Possession event. The event context aligns with Colombia or has no clear side conflict. Match phase: 2nd Half. Scoreline: Colombia 1 - 0 Ghana. Reliability check: No TXODDS reliability warning was found.",
    resultStatus: "correct",
    evidence: {
      source: "txline",
      fixtureId: "18179549",
      endpointUsed: "/api/odds/updates/18179549",
      bookmaker: "TXLineStablePriceDemargined",
      messageId: "1836215980:00003:000163-10021-stab",
      marketType: "1X2_PARTICIPANT_RESULT",
      scoresContext: {
        fixtureId: "18179549",
        latestAction: "attack_possession",
        actionLabel: "Attack Possession",
        actionTeam: "home",
        statusId: 4,
        statusName: "2nd Half",
        clockSeconds: 5834,
        minute: 97,
        homeScore: 1,
        awayScore: 0,
        scoreline: "Colombia 1 - 0 Ghana",
        scoreBreakdown: { h1: "1-0", total: "1-0", goals: "1-0", corners: "3-2", yellowCards: "2-3" },
        possessionType: "AttackPossession",
        pressureLevel: "ATTACK",
        fieldPressureScore: 22,
        reliability: "RELIABLE",
        sequence: 1029,
      },
    },
  },
  {
    id: "signal-18179549-txline-18179549-1783135662836-1836226794:00003:000001-10021-stab-home",
    matchId: "18179549",
    match: "Colombia vs Ghana",
    target: "Colombia",
    side: "home",
    signalType: "MOMENTUM_SHIFT",
    severity: "MEDIUM",
    oddsBefore: 1.19,
    oddsAfter: 1.04,
    oddsChangePct: 12.61,
    momentumScore: 18.63,
    explanation:
      "Colombia odds moved by 12.61% with sustained market direction. The agent flags this as a momentum shift. The move has moderate field context from a Attack Possession event. The event context aligns with Colombia or has no clear side conflict. Match phase: 2nd Half. Scoreline: Colombia 1 - 0 Ghana. Reliability check: No TXODDS reliability warning was found.",
    resultStatus: "correct",
    evidence: {
      source: "txline",
      fixtureId: "18179549",
      endpointUsed: "/api/odds/updates/18179549",
      bookmaker: "TXLineStablePriceDemargined",
      messageId: "1836226794:00003:000001-10021-stab",
      marketType: "1X2_PARTICIPANT_RESULT",
      scoresContext: {
        fixtureId: "18179549",
        latestAction: "attack_possession",
        actionLabel: "Attack Possession",
        actionTeam: "home",
        statusId: 4,
        statusName: "2nd Half",
        clockSeconds: 5834,
        minute: 97,
        homeScore: 1,
        awayScore: 0,
        scoreline: "Colombia 1 - 0 Ghana",
        scoreBreakdown: { h1: "1-0", total: "1-0", goals: "1-0", corners: "3-2", yellowCards: "2-3" },
        possessionType: "AttackPossession",
        pressureLevel: "ATTACK",
        fieldPressureScore: 22,
        reliability: "RELIABLE",
        sequence: 1029,
      },
    },
  },
  {
    id: "signal-18185036-txline-18185036-1783191053690-1836327775:00003:000526-1-10021-stab-home",
    matchId: "18185036",
    match: "Canada vs Morocco",
    target: "Canada",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 780,
    oddsAfter: 350,
    oddsChangePct: 55.13,
    momentumScore: 50.07,
    explanation:
      "Canada odds compressed by 55.13% from 780 to 350. The agent flags this as a high-severity sharp movement. The move is field-backed by a Goal event with high_danger pressure. Caution: the latest field event came from the away side, not the signal side. Match phase: 2nd Half. Scoreline: Canada 0 - 3 Morocco. Reliability check: No TXODDS reliability warning was found.",
    resultStatus: "incorrect",
    trapStatus: "CONFIRMED_TRAP",
    trapScore: 100,
    reversalRisk: "EXTREME_REVERSAL",
    evidence: {
      source: "txline",
      fixtureId: "18185036",
      endpointUsed: "/api/odds/updates/18185036",
      bookmaker: "TXLineStablePriceDemargined",
      messageId: "1836327775:00003:000526-1-10021-stab",
      marketType: "1X2_PARTICIPANT_RESULT",
      scoresContext: {
        fixtureId: "18185036",
        latestAction: "goal",
        actionLabel: "Goal",
        actionTeam: "away",
        statusId: 4,
        statusName: "2nd Half",
        clockSeconds: 5857,
        minute: 97,
        homeScore: 0,
        awayScore: 3,
        scoreline: "Canada 0 - 3 Morocco",
        scoreBreakdown: { h2: "0-3", total: "0-3", goals: "0-3", corners: "11-1", yellowCards: "4-4" },
        pressureLevel: "HIGH_DANGER",
        fieldPressureScore: 45,
        reliability: "RELIABLE",
        confirmed: true,
        sequence: 1117,
      },
    },
  },
  {
    id: "signal-18185036-txline-18185036-1783191107700-1836327810:00003:000067-1-10021-stab-home",
    matchId: "18185036",
    match: "Canada vs Morocco",
    target: "Canada",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 740,
    oddsAfter: 350,
    oddsChangePct: 52.7,
    momentumScore: 48.74,
    explanation:
      "Canada odds compressed by 52.7% from 740 to 350. The agent flags this as a high-severity sharp movement. The move is field-backed by a Goal event with high_danger pressure. Caution: the latest field event came from the away side, not the signal side. Match phase: 2nd Half. Scoreline: Canada 0 - 3 Morocco. Reliability check: No TXODDS reliability warning was found.",
    resultStatus: "incorrect",
    trapStatus: "CONFIRMED_TRAP",
    trapScore: 100,
    reversalRisk: "EXTREME_REVERSAL",
    evidence: {
      source: "txline",
      fixtureId: "18185036",
      endpointUsed: "/api/odds/updates/18185036",
      bookmaker: "TXLineStablePriceDemargined",
      messageId: "1836327810:00003:000067-1-10021-stab",
      marketType: "1X2_PARTICIPANT_RESULT",
      scoresContext: {
        fixtureId: "18185036",
        latestAction: "goal",
        actionLabel: "Goal",
        actionTeam: "away",
        statusId: 4,
        statusName: "2nd Half",
        clockSeconds: 5857,
        minute: 97,
        homeScore: 0,
        awayScore: 3,
        scoreline: "Canada 0 - 3 Morocco",
        scoreBreakdown: { h2: "0-3", total: "0-3", goals: "0-3", corners: "11-1", yellowCards: "4-4" },
        pressureLevel: "HIGH_DANGER",
        fieldPressureScore: 45,
        reliability: "RELIABLE",
        confirmed: true,
        sequence: 1117,
      },
    },
  },
];
```

- [ ] **Step 2: Verify the file type-checks in isolation**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npx tsc --noEmit src/data/pinnedCaseStudies.ts`
Expected: no output, exit code 0 (a bare `.ts` file with no imports type-checks standalone; this confirms the literal array matches the declared `PinnedCaseStudy[]` type before anything else depends on it).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/data/pinnedCaseStudies.ts
git commit -m "$(cat <<'EOF'
Add pinned case study data file

Typed, frontend-bundled copy of the 4 verbatim July 4/5 signals from
pinned-case-studies-raw.json, so they render even if the Render
backend is down or has reset its in-memory store. Only change from
the raw file: outcomeAuditLabel renamed to trapStatus to match the
field name already used elsewhere in the frontend.
EOF
)"
```

---

### Task 2: Create the VerifiedCaseStudiesPanel component

**Files:**
- Create: `apps/web/src/components/VerifiedCaseStudiesPanel.tsx`

**Interfaces:**
- Consumes: `PinnedCaseStudy`, `PINNED_CASE_STUDIES`, `PINNED_CASE_STUDIES_PROVENANCE` from `../data/pinnedCaseStudies` (Task 1).
- Produces: `export function VerifiedCaseStudiesPanel(): JSX.Element`, a section with `id="verified-case-studies"`. Task 3 imports and mounts this component; Task 4's disclaimer captions scroll to this element's id.

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/VerifiedCaseStudiesPanel.tsx` with this exact content:

```tsx
import { Fingerprint, ShieldCheck } from "lucide-react";
import {
  PINNED_CASE_STUDIES,
  PINNED_CASE_STUDIES_PROVENANCE,
  type PinnedCaseStudy,
} from "../data/pinnedCaseStudies";

function resultBadgeClass(resultStatus: PinnedCaseStudy["resultStatus"]) {
  return resultStatus === "correct"
    ? "bg-emerald-400/10 text-emerald-200"
    : "bg-rose-400/10 text-rose-200";
}

function EvidenceRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-xl bg-black/25 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-stone-200">
        {value !== undefined && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function CaseStudyCard({ caseStudy }: { caseStudy: PinnedCaseStudy }) {
  const scoresContext = caseStudy.evidence.scoresContext;
  const scoreBreakdown = scoresContext.scoreBreakdown;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {caseStudy.match} → {caseStudy.target}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {caseStudy.signalType.replaceAll("_", " ")} · {caseStudy.severity}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${resultBadgeClass(
            caseStudy.resultStatus
          )}`}
        >
          {caseStudy.resultStatus === "correct" ? "Correct" : "Incorrect"}
        </span>
      </div>

      <p className="mb-3 text-xs leading-5 text-stone-400">{caseStudy.explanation}</p>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">Before</p>
          <p className="mt-1 font-semibold text-stone-100">{caseStudy.oddsBefore}</p>
        </div>
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">After</p>
          <p className="mt-1 font-semibold text-stone-100">{caseStudy.oddsAfter}</p>
        </div>
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">Move</p>
          <p className="mt-1 font-semibold text-orange-200">{caseStudy.oddsChangePct}%</p>
        </div>
      </div>

      {caseStudy.trapStatus && (
        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-red-200/70">
              Smart Money Trap Detector
            </p>
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-red-100">
              Trap score {caseStudy.trapScore ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-purple-200">
            {(caseStudy.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
          </p>
        </div>
      )}

      <div className="grid gap-2 text-[11px] md:grid-cols-2">
        <EvidenceRow label="Fixture ID" value={caseStudy.evidence.fixtureId} />
        <EvidenceRow label="Message ID" value={caseStudy.evidence.messageId} />
        <EvidenceRow label="Bookmaker" value={caseStudy.evidence.bookmaker} />
        <EvidenceRow label="Odds endpoint" value={caseStudy.evidence.endpointUsed} />
        <EvidenceRow label="Scoreline" value={scoresContext.scoreline} />
        <EvidenceRow label="Reliability" value={scoresContext.reliability} />
        <EvidenceRow label="H1 goals" value={scoreBreakdown.h1} />
        <EvidenceRow label="H2 goals" value={scoreBreakdown.h2} />
        <EvidenceRow label="Total goals" value={scoreBreakdown.total ?? scoreBreakdown.goals} />
        <EvidenceRow label="Corners" value={scoreBreakdown.corners} />
        <EvidenceRow label="Yellow cards" value={scoreBreakdown.yellowCards} />
        <EvidenceRow label="Red cards" value={scoreBreakdown.redCards} />
      </div>
    </div>
  );
}

export function VerifiedCaseStudiesPanel() {
  return (
    <section
      id="verified-case-studies"
      className="rounded-[28px] border border-amber-400/20 bg-[#15100c] p-5 shadow-2xl shadow-black/30"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            <ShieldCheck className="h-4 w-4" />
            Verified Case Studies — Permanent Record
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-stone-400">
            {PINNED_CASE_STUDIES_PROVENANCE}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">
          <Fingerprint className="h-3.5 w-3.5" />
          Pinned, not live
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {PINNED_CASE_STUDIES.map((caseStudy) => (
          <CaseStudyCard key={caseStudy.id} caseStudy={caseStudy} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run build`
Expected: build completes successfully (no TypeScript errors, no unused-import errors — this file is not imported anywhere yet, so Vite/tsc will type-check it but it won't appear in the bundle output until Task 3 mounts it).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/VerifiedCaseStudiesPanel.tsx
git commit -m "$(cat <<'EOF'
Add VerifiedCaseStudiesPanel component

Standalone, self-contained panel rendering the 4 pinned case studies
with evidence rows and Smart Money Trap styling matching existing
patterns in ResultsSettlementPanel/App.tsx. Not yet mounted anywhere.
EOF
)"
```

---

### Task 3: Mount the panel in App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx:4` (imports)
- Modify: `apps/web/src/App.tsx:2253-2259` (panel mounting order)

**Interfaces:**
- Consumes: `VerifiedCaseStudiesPanel` from `./components/VerifiedCaseStudiesPanel` (Task 2).

- [ ] **Step 1: Add the import**

In `apps/web/src/App.tsx`, find the existing panel imports (currently lines 2-4):

```typescript
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import { ResultsSettlementPanel } from "./components/ResultsSettlementPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
```

Replace with:

```typescript
import { SignalIntelligencePanel } from "./components/SignalIntelligencePanel";
import { ResultsSettlementPanel } from "./components/ResultsSettlementPanel";
import { VerifiedCaseStudiesPanel } from "./components/VerifiedCaseStudiesPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
```

- [ ] **Step 2: Mount the panel between ResultsSettlementPanel and WhatChangedPanel**

Find this exact block (currently around lines 2253-2259):

```tsx
          <div className="2xl:col-span-2">
            <SignalIntelligencePanel />
          </div>

          <ResultsSettlementPanel />

          <WhatChangedPanel />
```

Replace with:

```tsx
          <div className="2xl:col-span-2">
            <SignalIntelligencePanel />
          </div>

          <ResultsSettlementPanel />

          <VerifiedCaseStudiesPanel />

          <WhatChangedPanel />
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run build`
Expected: build completes successfully with no TypeScript or Vite errors.

- [ ] **Step 4: Manually verify the panel renders in the correct position**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`

Open `http://127.0.0.1:5175` in a browser. Scroll the main dashboard column and confirm:
- The "Verified Case Studies — Permanent Record" panel appears directly after the "TXODDS recent results" / "Signal settlement center" panels (`ResultsSettlementPanel`) and before the "What changed?" panel (`WhatChangedPanel`).
- All 4 case study cards render: 2 for Colombia vs Ghana (both "Correct"), 2 for Canada vs Morocco (both "Incorrect", both showing the red Smart Money Trap Detector block with "Trap score 100" and "EXTREME REVERSAL").

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
Mount VerifiedCaseStudiesPanel in the dashboard

Inserted between ResultsSettlementPanel and WhatChangedPanel so the
pinned evidence sits alongside the other audit/evidence panels.
EOF
)"
```

---

### Task 4: Add the small-sample disclaimer captions and final verification

**Files:**
- Modify: `apps/web/src/App.tsx` (add `scrollToCaseStudies` helper near `goToSection`, currently defined at lines 999-1005)
- Modify: `apps/web/src/App.tsx:1727-1743` (Accuracy stat tile)
- Modify: `apps/web/src/App.tsx:2609` (P&L card note)

**Interfaces:**
- Consumes: `stats` and `pnl` state already present in `App.tsx` (no new state, no new fetching).
- Produces: `scrollToCaseStudies()` function usable by both disclaimer captions.

- [ ] **Step 1: Add the scroll helper function**

In `apps/web/src/App.tsx`, find `goToSection` (currently lines 999-1005):

```tsx
  function goToSection(sectionId: string) {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
```

Add this function directly after it:

```tsx
  function scrollToCaseStudies() {
    document.getElementById("verified-case-studies")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
```

- [ ] **Step 2: Add the disclaimer caption to the Accuracy tile**

Find the Accuracy tile's value block (currently lines 1727-1743):

```tsx
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Accuracy</p>
                        {(stats?.closedSignals ?? 0) > 0 ? (
                          <p
                            className={`text-xl font-bold tabular-nums ${
                              (stats?.strategyAccuracy ?? 0) >= 60
                                ? "text-emerald-300"
                                : (stats?.strategyAccuracy ?? 0) >= 40
                                  ? "text-amber-300"
                                  : "text-red-300"
                            }`}
                          >
                            {formatPercent(stats?.strategyAccuracy)}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-stone-400">Building…</p>
                        )}
                      </div>
```

Replace with (adds a clickable disclaimer caption after the existing value):

```tsx
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">Accuracy</p>
                        {(stats?.closedSignals ?? 0) > 0 ? (
                          <p
                            className={`text-xl font-bold tabular-nums ${
                              (stats?.strategyAccuracy ?? 0) >= 60
                                ? "text-emerald-300"
                                : (stats?.strategyAccuracy ?? 0) >= 40
                                  ? "text-amber-300"
                                  : "text-red-300"
                            }`}
                          >
                            {formatPercent(stats?.strategyAccuracy)}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-stone-400">Building…</p>
                        )}
                        <button
                          type="button"
                          onClick={scrollToCaseStudies}
                          className="mt-1 block text-left text-[8px] leading-tight text-stone-500 underline decoration-dotted hover:text-stone-300"
                        >
                          n={stats?.closedSignals ?? 0} closed — too small to be meaningful · See verified case studies
                        </button>
                      </div>
```

- [ ] **Step 3: Add the disclaimer line to the P&L card**

Find the P&L note line (currently line 2609):

```tsx
                <p className="mt-2 text-[9px] leading-4 text-stone-500">{pnl.note}</p>
```

Replace with:

```tsx
                <p className="mt-2 text-[9px] leading-4 text-stone-500">{pnl.note}</p>
                <button
                  type="button"
                  onClick={scrollToCaseStudies}
                  className="mt-1 block text-left text-[9px] leading-4 text-stone-500 underline decoration-dotted hover:text-stone-300"
                >
                  Based on {pnl.settledBets} settled bet(s) — see verified case studies for permanently confirmed historical examples
                </button>
```

- [ ] **Step 4: Verify the build succeeds**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run build`
Expected: build completes successfully with no TypeScript or Vite errors.

- [ ] **Step 5: Manually verify both disclaimers and their click-through behavior**

Run: `cd C:\Projects\goalpulse-agent\apps\web && npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`

Open `http://127.0.0.1:5175` in a browser and confirm:
- The Accuracy stat tile in the header shows the new small caption below the percentage (e.g. "n=5 closed — too small to be meaningful · See verified case studies").
- Clicking that caption smoothly scrolls the page down to the "Verified Case Studies — Permanent Record" panel.
- Scroll to the "Outcome audit mode" card in the right sidebar and confirm the P&L section shows the new caption below the existing note text.
- Clicking that caption also smoothly scrolls to the "Verified Case Studies — Permanent Record" panel.

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "$(cat <<'EOF'
Add small-sample disclaimer near live accuracy and P&L

Always-visible captions next to the Accuracy stat tile and inside
the P&L card, both linking to the new Verified Case Studies panel,
so a small/unlucky live sample never stands alone without honest
context for a judge.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Data source and provenance (raw file untouched, canonical typed copy, one field rename) → Task 1.
- Architecture & data flow (frontend-only, no backend, no fetch) → Task 1 + Task 2 (no network code anywhere).
- Component design (standalone, own local type, evidence rows, trap styling, `id="verified-case-studies"`) → Task 2.
- Placement in App.tsx (after ResultsSettlementPanel, before WhatChangedPanel) → Task 3.
- Disclaimer integration (2 locations, always visible, click-through scroll) → Task 4.
- Error handling (none needed) → satisfied by construction (no fetch/loading/error state introduced anywhere).
- Testing/verification (`npm run build` + manual dev-server check) → present in every task.
- Alternatives considered / Approach A constraint (no shared abstraction, no edits to existing panels' internals) → honored throughout; `ResultsSettlementPanel.tsx` and `SignalIntelligencePanel.tsx` are never modified.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, runnable content copied from the actual raw JSON values.

**Type consistency:** `PinnedCaseStudy` (Task 1) is the single type used by both `pinnedCaseStudies.ts` and `VerifiedCaseStudiesPanel.tsx` (Task 2) via import — no redefinition or drift. Field names (`trapStatus`, `trapScore`, `reversalRisk`, `resultStatus`) match what `App.tsx` already expects elsewhere in the codebase for these concepts.
