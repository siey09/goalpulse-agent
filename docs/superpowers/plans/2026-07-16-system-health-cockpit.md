# System Health Operations Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse System Health page with an issue-first operations cockpit using existing API, cycle, fixture, odds, stream, and archive observability.

**Architecture:** Keep `/health` and stats owned by `App.tsx`; pass a nullable archive summary into the page. Add a page-scoped observability hook that polls `/api/metrics` and `/api/feed-health` independently every 10 seconds, pure model helpers that derive deterministic stage and incident states, and focused display components for the diagnostic spine and stream monitors.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Vitest 4, Testing Library, existing Lucide icons; no new dependency.

## Global Constraints

- Use only `/health`, `/api/metrics`, `/api/feed-health`, and already-fetched stats fields.
- Add no backend endpoint, persistent incident storage, package dependency, or global polling loop.
- Do not show a historical line or trend without historical samples.
- Never default a missing metric to zero or call the overall system Healthy without a successful feed-health response.
- Preserve backend stream statuses exactly: `STREAMING`, `STALE`, `RECONNECTING`, and `STOPPED`.
- Treat `STOPPED` in simulated mode as intentionally disabled, not an outage.
- Reuse the backend five-minute odds-stale threshold and three-times-cycle-gap logic; invent no threshold.
- Retain the last successful source data after a later poll fails, and mark that source stale/unavailable.
- Preserve keyboard focus, text status labels, semantic lists, reduced-motion behavior, and no horizontal scrolling at 390 px.

## File Structure

- Create `apps/web/src/features/health/systemHealthModel.ts`: API response types, formatting, stage derivation, verdict summary, and incident derivation.
- Create `apps/web/src/features/health/systemHealthModel.test.ts`: pure unit tests for truthfulness, precedence, simulated mode, and invalid dates.
- Create `apps/web/src/features/health/useSystemObservability.ts`: independent page-scoped polling and stale-last-success state.
- Create `apps/web/src/features/health/useSystemObservability.test.tsx`: fake-timer and fetch-boundary tests.
- Create `apps/web/src/features/health/HealthDiagnosticSpine.tsx`: accessible five-stage pipeline.
- Create `apps/web/src/features/health/StreamMonitorCard.tsx`: exact push/odds stream facts.
- Create `apps/web/src/features/health/SystemHealthPage.test.tsx`: cockpit integration, loading/error, semantic, navigation-free, and responsive tests.
- Modify `apps/web/src/features/health/SystemHealthPage.tsx`: compose verdict, telemetry, spine, streams, incidents, and thresholds.
- Modify `apps/web/src/types.ts`: extend `Health` with fields already returned by `/health`.
- Modify `apps/web/src/App.tsx`: pass nullable archive status from existing stats.

---

### Task 1: Truthful health model

**Files:**
- Create: `apps/web/src/features/health/systemHealthModel.ts`
- Create: `apps/web/src/features/health/systemHealthModel.test.ts`

**Interfaces:**
- Produces: `SystemMetrics`, `FeedHealth`, `ArchiveHealthSummary`, `HealthStage`, `HealthIncident`, `formatHealthDuration`, `formatHealthTime`, `deriveHealthStages`, `deriveHealthIncidents`, and `summarizeHealthVerdict`.
- Consumes: extended `Health` from `apps/web/src/types.ts` and primitives from existing endpoint responses.

- [ ] **Step 1: Write failing tests for formatting and status precedence**

```ts
import { describe, expect, it } from "vitest";
import {
  deriveHealthIncidents,
  deriveHealthStages,
  formatHealthDuration,
  formatHealthTime,
  summarizeHealthVerdict,
  type FeedHealth,
  type SystemMetrics,
} from "./systemHealthModel";

const feedHealth: FeedHealth = {
  status: "healthy",
  cycleHealth: {
    lastRunAt: "2026-07-16T07:00:00.000Z",
    cycleGapMs: 3_000,
    expectedIntervalMs: 3_000,
    isCurrentGapExceeded: false,
    recentMissedCycles: 0,
  },
  oddsFreshness: {
    staleThresholdMs: 300_000,
    staleLiveMatchCount: 0,
    staleLiveMatches: [],
  },
  fixtureCoverage: {
    lastRunRawFixtureCount: 7,
    lastRunProcessedCount: 7,
    isCoverageDropped: false,
    recentCoverageDrops: 0,
  },
};

const metrics: SystemMetrics = {
  uptimeSeconds: 3661,
  lastAgentCycle: {
    startedAt: "2026-07-16T07:00:00.000Z",
    finishedAt: "2026-07-16T07:00:01.200Z",
    decisionLatencyMs: 1200,
  },
  liveStream: { connected: true, staleForMs: 2000, totalReconnects: 0, status: "STREAMING" },
  liveOddsStream: { connected: true, staleForMs: 3000, totalReconnects: 0, status: "STREAMING" },
  duplicatesDropped: 4,
};

describe("systemHealthModel", () => {
  it("formats durations and rejects invalid timestamps honestly", () => {
    expect(formatHealthDuration(3_661_000)).toBe("1h 1m");
    expect(formatHealthDuration(null)).toBe("Unavailable");
    expect(formatHealthTime("not-a-date")).toBe("Time unavailable");
  });

  it("keeps error precedence above degraded and healthy", () => {
    const stages = deriveHealthStages({
      health: { ok: true },
      feedHealth: {
        ...feedHealth,
        cycleHealth: { ...feedHealth.cycleHealth, isCurrentGapExceeded: true },
        fixtureCoverage: { ...feedHealth.fixtureCoverage, recentCoverageDrops: 2 },
      },
      archiveStatus: { pending: 3, failures: 1, lastFailureAt: null },
    });
    expect(stages.map((stage) => [stage.id, stage.status])).toEqual([
      ["api", "healthy"],
      ["cycle", "down"],
      ["fixtures", "degraded"],
      ["odds", "healthy"],
      ["archive", "down"],
    ]);
  });

  it("does not call missing feed health healthy", () => {
    expect(summarizeHealthVerdict(null, [])).toEqual({ label: "Unavailable", tone: "unknown" });
    expect(summarizeHealthVerdict(feedHealth, [])).toEqual({ label: "Healthy", tone: "healthy" });
  });

  it("treats STOPPED streams as intentional when simulated mode is on", () => {
    const stoppedMetrics: SystemMetrics = {
      ...metrics,
      liveStream: { connected: false, staleForMs: null, totalReconnects: 0, status: "STOPPED" },
    };
    expect(deriveHealthIncidents({
      health: { useSimulatedFeed: true },
      metrics: stoppedMetrics,
      feedHealth,
      archiveStatus: null,
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the model test and verify the red state**

Run: `cd apps/web && npm.cmd test -- src/features/health/systemHealthModel.test.ts`

Expected: FAIL because `systemHealthModel` does not exist.

- [ ] **Step 3: Implement exact response and derived-state types**

Define endpoint fields exactly as specified in the approved design. Use these derived unions:

```ts
export type HealthStageStatus = "healthy" | "degraded" | "down" | "unknown";
export type HealthIncidentSeverity = "critical" | "warning";

export interface HealthStage {
  id: "api" | "cycle" | "fixtures" | "odds" | "archive";
  label: string;
  status: HealthStageStatus;
  value: string;
  detail: string;
}

export interface HealthIncident {
  id: string;
  severity: HealthIncidentSeverity;
  title: string;
  evidence: string;
}
```

Implement stage precedence as `down -> degraded -> healthy -> unknown`. `deriveHealthIncidents` emits incidents only from explicit flags, counts, or real-feed stream statuses. `summarizeHealthVerdict` returns Unavailable for null feed health, otherwise maps the endpoint status directly.

- [ ] **Step 4: Run the focused model test**

Run: `cd apps/web && npm.cmd test -- src/features/health/systemHealthModel.test.ts`

Expected: all model tests pass.

- [ ] **Step 5: Commit the health model**

```powershell
git add apps/web/src/features/health/systemHealthModel.ts apps/web/src/features/health/systemHealthModel.test.ts
git commit -m "feat(system-health): model truthful diagnostics"
```

---

### Task 2: Independent observability polling

**Files:**
- Create: `apps/web/src/features/health/useSystemObservability.ts`
- Create: `apps/web/src/features/health/useSystemObservability.test.tsx`

**Interfaces:**
- Consumes: `SystemMetrics` and `FeedHealth` from Task 1 plus `API_BASE_URL` resolved locally from `VITE_API_BASE_URL`.
- Produces: `useSystemObservability(): { metrics; feedHealth; metricsState; feedHealthState; lastSuccessfulRefreshAt }`.
- `metricsState` and `feedHealthState` are exactly `"loading" | "fresh" | "stale" | "unavailable"`.

- [ ] **Step 1: Write failing hook tests for independent success and failure**

Use `renderHook`, fake timers, and a URL-aware fetch mock. Assert:

```ts
expect(result.current.metricsState).toBe("fresh");
expect(result.current.feedHealthState).toBe("unavailable");
expect(result.current.metrics).toEqual(metricsPayload.data);
expect(result.current.feedHealth).toBeNull();
```

Add a second test where the first poll succeeds, the second metrics request fails, and feed health succeeds. After advancing 10 seconds, assert the old metrics object is retained with `metricsState === "stale"`, while feed health updates and remains `fresh`.

Add cleanup assertions that unmount aborts both active requests and clears the interval.

- [ ] **Step 2: Run the hook test and verify the red state**

Run: `cd apps/web && npm.cmd test -- src/features/health/useSystemObservability.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the page-scoped polling hook**

Use one effect with an `AbortController` per poll cycle and `Promise.allSettled` over two requests. Parse `{ data: T }`, reject non-2xx responses, and update each source independently. On failure:

- existing data -> retain it and set `stale`;
- no existing data -> keep null and set `unavailable`.

Set `lastSuccessfulRefreshAt` only when at least one source succeeds. Poll immediately and every `10_000` ms. Cleanup clears the timer and aborts the latest controller.

- [ ] **Step 4: Run the hook tests**

Run: `cd apps/web && npm.cmd test -- src/features/health/useSystemObservability.test.tsx`

Expected: independent failure, stale retention, and cleanup cases pass.

- [ ] **Step 5: Commit the polling hook**

```powershell
git add apps/web/src/features/health/useSystemObservability.ts apps/web/src/features/health/useSystemObservability.test.tsx
git commit -m "feat(system-health): poll observability independently"
```

---

### Task 3: Diagnostic and stream components

**Files:**
- Create: `apps/web/src/features/health/HealthDiagnosticSpine.tsx`
- Create: `apps/web/src/features/health/HealthDiagnosticSpine.test.tsx`
- Create: `apps/web/src/features/health/StreamMonitorCard.tsx`
- Create: `apps/web/src/features/health/StreamMonitorCard.test.tsx`

**Interfaces:**
- Consumes: `HealthStage`, `SystemMetrics` stream objects, `/health` stream counters, and simulated-mode flag.
- Produces: `HealthDiagnosticSpine({ stages })` and `StreamMonitorCard({ title, stream, metrics, isSimulated })`.

- [ ] **Step 1: Write failing semantic spine tests**

Render five stages and assert an ordered list named `System diagnostic pipeline`, each stage exposes its label and text status, and the connector element is `aria-hidden`. Assert the root contains `motion-reduce:transition-none` on animated status rails.

- [ ] **Step 2: Write failing stream monitor tests**

Cover:

- STREAMING with exact event count, freshness, reconnect count, and no error;
- STALE with warning text;
- RECONNECTING with last backend error;
- STOPPED plus simulated mode with `Intentionally disabled in simulated mode`;
- missing stream facts with `Stream data unavailable` rather than zero events.

- [ ] **Step 3: Run both component tests and verify red**

Run: `cd apps/web && npm.cmd test -- src/features/health/HealthDiagnosticSpine.test.tsx src/features/health/StreamMonitorCard.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 4: Implement the diagnostic spine**

Render a `Card` containing an ordered `grid` that becomes five columns at `xl`. Every item shows a semantic text badge, exact value, and detail. Use stable `stage.id` keys. Keep connecting rules decorative, and stack without horizontal scrolling below `xl`.

- [ ] **Step 5: Implement the stream monitor card**

Render title, exact status, last-event age, event count, reconnect count, and optional last error in a semantic definition list. Never use `?? 0` for missing counters. Map colors only after the text status is rendered. Use `formatHealthDuration` for freshness.

- [ ] **Step 6: Run the focused component tests**

Run: `cd apps/web && npm.cmd test -- src/features/health/HealthDiagnosticSpine.test.tsx src/features/health/StreamMonitorCard.test.tsx`

Expected: all diagnostic and stream tests pass.

- [ ] **Step 7: Commit the diagnostic components**

```powershell
git add apps/web/src/features/health/HealthDiagnosticSpine.tsx apps/web/src/features/health/HealthDiagnosticSpine.test.tsx apps/web/src/features/health/StreamMonitorCard.tsx apps/web/src/features/health/StreamMonitorCard.test.tsx
git commit -m "feat(system-health): add diagnostic and stream monitors"
```

---

### Task 4: Integrate the operations cockpit

**Files:**
- Create: `apps/web/src/features/health/SystemHealthPage.test.tsx`
- Modify: `apps/web/src/features/health/SystemHealthPage.tsx`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: model, hook, and components from Tasks 1-3.
- Produces: `SystemHealthPage({ health, archiveStatus })` with the complete operations cockpit.

- [ ] **Step 1: Write failing cockpit integration tests**

Mock `useSystemObservability` at the module boundary and render representative Healthy data. Assert named regions/headings for:

- Overall system health;
- Operational telemetry;
- System diagnostic pipeline;
- Active incidents;
- TxLINE push stream;
- Live odds stream;
- Signal threshold reference.

Assert API uptime, agent latency, freshness threshold, fixture processed/raw ratio, archive stage, duplicates dropped, and all three thresholds are visible. Assert the old isolated titles `TxLINE Push Feed`, `Agent Status`, and mojibake strings are absent.

- [ ] **Step 2: Add degraded, unavailable, and no-incident cases**

Assert:

- a down cycle produces Down verdict and a critical incident;
- missing feed health produces Unavailable even if `health.ok` is true;
- no incidents renders `No active health incidents.` only when all required sources are fresh;
- null archive status renders Archive unavailable;
- source state `stale` produces a visible stale-data notice while retaining values;
- no output contains `NaN` or a false zero.

- [ ] **Step 3: Run the page test and verify red**

Run: `cd apps/web && npm.cmd test -- src/features/health/SystemHealthPage.test.tsx`

Expected: FAIL because the current sparse page lacks the cockpit contract.

- [ ] **Step 4: Extend the web Health type**

Add `service`, `status`, `timestamp`, and `liveOddsStream` to `Health`; extract a shared `HealthStreamState` type used by both streams. Keep every field optional because loading and partial test payloads are valid UI states.

- [ ] **Step 5: Update the page and App contract**

Use the `ArchiveHealthSummary` model type rather than declaring a second archive shape:

```ts
export interface SystemHealthPageProps {
  health: Health | null;
  archiveStatus: ArchiveHealthSummary | null;
}
```

In `App.tsx`, pass:

```tsx
archiveStatus={stats?.oddsArchive ? {
  pending: stats.oddsArchive.pending,
  failures: stats.oddsArchive.failures,
  lastFailureAt: stats.oddsArchive.lastFailureAt,
} : null}
```

Compose the page in a 12-column layout. Use the feed-health status for the verdict, four telemetry cards, the five-stage spine, incident queue, two stream cards, and a compact threshold strip showing `>= 4%`, `>= 8%`, and `>= 15%`.

- [ ] **Step 6: Run all System Health tests**

Run: `cd apps/web && npm.cmd test -- src/features/health`

Expected: model, hook, component, and page tests all pass.

- [ ] **Step 7: Commit the integrated cockpit**

```powershell
git add apps/web/src/App.tsx apps/web/src/types.ts apps/web/src/features/health/SystemHealthPage.tsx apps/web/src/features/health/SystemHealthPage.test.tsx
git commit -m "feat(system-health): build operations cockpit"
```

---

### Task 5: Responsive and release verification

**Files:**
- Modify only if verification exposes a defect: `apps/web/src/features/health/*.tsx`
- Modify alongside any fix: the corresponding `apps/web/src/features/health/*.test.tsx`

**Interfaces:**
- Consumes: the complete cockpit from Task 4.
- Produces: verified responsive, accessible, test, lint, and production-build evidence.

- [ ] **Step 1: Add responsive and reduced-motion source assertions**

Assert the main layout includes `xl:grid-cols-12`, telemetry includes `sm:grid-cols-2` and `xl:grid-cols-4`, stream cards stack below `lg`, no fixed minimum width can overflow 390 px, and animated rails contain `motion-reduce:transition-none`.

- [ ] **Step 2: Run the complete web test suite**

Run: `cd apps/web && npm.cmd test`

Expected: every web test passes with zero failures.

- [ ] **Step 3: Run lint**

Run: `cd apps/web && npm.cmd run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run the production build**

Run: `cd apps/web && npm.cmd run build`

Expected: TypeScript and Vite succeed. Record the existing main-chunk warning separately if it remains.

- [ ] **Step 5: Inspect responsive states with representative API-shaped data**

Inspect 1440 px, 1024 px, and exact 390 px emulation when available. Confirm the verdict and incidents lead, telemetry is dense without crowding, the spine preserves order, stream facts remain readable, thresholds stay secondary, and no horizontal document overflow exists.

- [ ] **Step 6: Verify repository state and commit any inspection fixes**

Run: `git diff --check` and `git status --short`.

If verification changed code, stage only System Health files and commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/types.ts apps/web/src/features/health
git commit -m "fix(system-health): finish responsive cockpit polish"
```

If no code changed, do not create an empty commit.

## Completion Evidence

Before declaring completion, report:

- System Health-focused test count and result;
- complete web test count and result;
- lint result;
- production build result;
- responsive inspection widths and limitations;
- exact commits created;
- confirmation that no backend endpoint, threshold, or polling cadence outside the mounted page changed.
