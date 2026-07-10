# P1-3 Backend Correlation Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the totals-line overcounting bug in `logic/signalCorrelation.ts` at its source (backend) instead of the current client-side workaround duplicated in two frontend files.

**Architecture:** A local `baseMatchId` helper (matching the exact pattern already proven in `logic/signalPerformance.ts`) is added to `signalCorrelation.ts` and used both when building each cluster's `matchIds` and when filtering for "2+ distinct matches." This is an in-place semantics change to the existing `matchIds`/`matchCount` fields on `GET /api/signal-correlation` and `GET /api/signal-correlation/patterns` — approved by the user, matches precedent, no other consumer depends on the raw totals-suffixed form. Once the backend returns correct data, the two frontend spots that independently worked around the bug (`SignalCorrelationPanel.tsx`, `App.tsx`'s analyst-chat handler) can delete their local dedup logic entirely.

**Tech Stack:** TypeScript, Vitest (backend), React/TypeScript (frontend, no test runner — manual verification).

## Global Constraints

- `matchIds`/`matchCount` semantics change in place on both `GET /api/signal-correlation` and `GET /api/signal-correlation/patterns` — do not add parallel new fields.
- Fix applies to both `findSignalClusters` and `findPatternMatchedClusters`, not just the one with a live frontend consumer.
- All existing tests in `signalCorrelation.test.ts` use plain `match-1`/`match-2`-style ids with no `-totals-` suffix — they must all stay green, unchanged, since `baseMatchId` is a no-op on them.
- Verify backend with `npm run test && npm run build` from `apps/api` after the backend task; verify frontend with `npm run build` from `apps/web` after the frontend task.

---

### Task 1: Backend dedup fix

**Files:**
- Modify: `apps/api/src/logic/signalCorrelation.ts`
- Modify: `apps/api/src/logic/signalCorrelation.test.ts`

**Interfaces:**
- No signature changes to `findSignalClusters`, `findPatternMatchedClusters`, `SignalCluster`, or `PatternCluster` — same function names, same return types, only the *values* inside `matchIds`/`matchCount` change.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/logic/signalCorrelation.test.ts`, find:

```typescript
  it("counts a mixed-severity cluster's severityBreakdown correctly", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), severity: "MEDIUM" }),
      makeSignal({ id: "s2", matchId: "match-2", createdAt: iso(120), severity: "LOW" }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].severityBreakdown).toEqual({ high: 1, medium: 1, low: 1 });
  });
});
```

Replace with:

```typescript
  it("counts a mixed-severity cluster's severityBreakdown correctly", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(60), severity: "MEDIUM" }),
      makeSignal({ id: "s2", matchId: "match-2", createdAt: iso(120), severity: "LOW" }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].severityBreakdown).toEqual({ high: 1, medium: 1, low: 1 });
  });

  it("does not report a cluster when multiple totals-line signals all come from the same real match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(60),
        target: "Over 3.5",
      }),
    ];

    expect(findSignalClusters(signals, 300000)).toEqual([]);
  });

  it("dedupes matchIds/matchCount by real match when totals lines are mixed with a genuine second match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(30),
        target: "Over 3.5",
      }),
      makeSignal({ id: "s2", matchId: "fixture-2", createdAt: iso(60) }),
    ];

    const clusters = findSignalClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["fixture-1", "fixture-2"]);
    expect(clusters[0].matchCount).toBe(2);
    expect(clusters[0].signalCount).toBe(3);
  });
});
```

Then find:

```typescript
  it("chains gaps into one cluster when all signals share the same pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });
});
```

Replace with:

```typescript
  it("chains gaps into one cluster when all signals share the same pattern", () => {
    const signals = [
      makeSignal({ id: "s0", matchId: "match-1", createdAt: iso(0), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s1", matchId: "match-2", createdAt: iso(240), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s2", matchId: "match-1", createdAt: iso(480), side: "home", severity: "HIGH" }),
      makeSignal({ id: "s3", matchId: "match-2", createdAt: iso(720), side: "home", severity: "HIGH" }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["match-1", "match-2"]);
    expect(clusters[0].signalCount).toBe(4);
    expect(clusters[0].spanMs).toBe(720000);
  });

  it("does not report a pattern cluster when multiple totals-line signals sharing the same pattern all come from the same real match", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-1-totals-3.5",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 3.5",
      }),
    ];

    expect(findPatternMatchedClusters(signals, 300000)).toEqual([]);
  });

  it("dedupes pattern-cluster matchIds/matchCount by real match across a genuine 2-match totals pattern", () => {
    const signals = [
      makeSignal({
        id: "s0",
        matchId: "fixture-1-totals-2.5",
        createdAt: iso(0),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
      makeSignal({
        id: "s1",
        matchId: "fixture-2-totals-2.5",
        createdAt: iso(60),
        side: "home",
        severity: "HIGH",
        target: "Over 2.5",
      }),
    ];

    const clusters = findPatternMatchedClusters(signals, 300000);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchIds).toEqual(["fixture-1", "fixture-2"]);
    expect(clusters[0].matchCount).toBe(2);
    expect(clusters[0].market).toBe("totals");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run from `apps/api`: `npx vitest run src/logic/signalCorrelation.test.ts`
Expected: the 4 new tests FAIL (the same-match totals-line cases currently report a false 2-match cluster since dedup isn't applied yet; the mixed-match cases currently report raw suffixed ids like `"fixture-1-totals-2.5"` instead of `"fixture-1"`). All pre-existing tests in the file still PASS.

- [ ] **Step 3: Implement the fix**

In `apps/api/src/logic/signalCorrelation.ts`, find:

```typescript
import type { AgentSignal, Severity } from "../types";
import { isTotalsSignal } from "./arena";

export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;
```

Replace with:

```typescript
import type { AgentSignal, Severity } from "../types";
import { isTotalsSignal } from "./arena";

export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * A totals signal's matchId is `<fixtureId>-totals-<line>` (see
 * isTotalsMatchId in services/archive.ts) - six different total-goals
 * lines for the same real match would otherwise count as six "distinct
 * matches" when building/filtering clusters below. Same implementation
 * as logic/signalPerformance.ts's baseMatchId, duplicated locally per
 * this codebase's convention of small independent logic modules.
 */
function baseMatchId(matchId: string): string {
  return matchId.split("-totals-")[0];
}
```

Then find:

```typescript
function buildCluster(group: AgentSignal[]): SignalCluster {
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();
  const severityBreakdown = { high: 0, medium: 0, low: 0 };

  for (const signal of group) {
    if (!seenMatchIds.has(signal.matchId)) {
      seenMatchIds.add(signal.matchId);
      matchIds.push(signal.matchId);
    }

    const key = severityKey(signal.severity);
    if (key) severityBreakdown[key] += 1;
  }
```

Replace with:

```typescript
function buildCluster(group: AgentSignal[]): SignalCluster {
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();
  const severityBreakdown = { high: 0, medium: 0, low: 0 };

  for (const signal of group) {
    const base = baseMatchId(signal.matchId);
    if (!seenMatchIds.has(base)) {
      seenMatchIds.add(base);
      matchIds.push(base);
    }

    const key = severityKey(signal.severity);
    if (key) severityBreakdown[key] += 1;
  }
```

Then find:

```typescript
export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const groups = sessionWindowGroups(signals, (signal) => signal.createdAt, windowMs);

  return groups
    .filter((group) => new Set(group.map((signal) => signal.matchId)).size >= 2)
    .map(buildCluster);
}
```

Replace with:

```typescript
export function findSignalClusters(
  signals: AgentSignal[],
  windowMs: number
): SignalCluster[] {
  const groups = sessionWindowGroups(signals, (signal) => signal.createdAt, windowMs);

  return groups
    .filter((group) => new Set(group.map((signal) => baseMatchId(signal.matchId))).size >= 2)
    .map(buildCluster);
}
```

Then find:

```typescript
function buildPatternCluster(group: AgentSignal[]): PatternCluster {
  const first = group[0];
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();

  for (const signal of group) {
    if (!seenMatchIds.has(signal.matchId)) {
      seenMatchIds.add(signal.matchId);
      matchIds.push(signal.matchId);
    }
  }
```

Replace with:

```typescript
function buildPatternCluster(group: AgentSignal[]): PatternCluster {
  const first = group[0];
  const matchIds: string[] = [];
  const seenMatchIds = new Set<string>();

  for (const signal of group) {
    const base = baseMatchId(signal.matchId);
    if (!seenMatchIds.has(base)) {
      seenMatchIds.add(base);
      matchIds.push(base);
    }
  }
```

Then find:

```typescript
  for (const group of byPatternKey.values()) {
    const windows = sessionWindowGroups(group, (signal) => signal.createdAt, windowMs);

    for (const window of windows) {
      if (new Set(window.map((signal) => signal.matchId)).size >= 2) {
        clusters.push(buildPatternCluster(window));
      }
    }
  }
```

Replace with:

```typescript
  for (const group of byPatternKey.values()) {
    const windows = sessionWindowGroups(group, (signal) => signal.createdAt, windowMs);

    for (const window of windows) {
      if (new Set(window.map((signal) => baseMatchId(signal.matchId))).size >= 2) {
        clusters.push(buildPatternCluster(window));
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/signalCorrelation.test.ts`
Expected: PASS, all tests in the file green (the 4 new ones plus every pre-existing one, unaffected since none of them use a `-totals-` suffixed matchId).

- [ ] **Step 5: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass (226 existing + 4 new = 230), clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/signalCorrelation.ts apps/api/src/logic/signalCorrelation.test.ts
git commit -m "Dedupe signal-correlation clusters by real match, not raw matchId (P1-3)"
```

---

### Task 2: Frontend simplification

**Files:**
- Modify: `apps/web/src/components/SignalCorrelationPanel.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/signal-correlation/patterns`'s `matchIds`/`matchCount` fields, now already deduped by real match (Task 1) — no client-side dedup needed at either call site.

- [ ] **Step 1: Simplify `SignalCorrelationPanel.tsx`**

Find:

```typescript
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
```

Replace with:

```typescript
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

function formatDuration(ms: number): string {
```

Then find:

```typescript
export function SignalCorrelationPanel() {
  const [clusters, setClusters] = useState<GenuineCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
```

Replace with:

```typescript
export function SignalCorrelationPanel() {
  const [clusters, setClusters] = useState<PatternCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
```

Then find:

```typescript
        const raw: PatternCluster[] = Array.isArray(payload.data) ? payload.data : [];

        const genuine: GenuineCluster[] = raw
          .map((cluster) => ({
            ...cluster,
            realMatchIds: distinctRealMatches(cluster.matchIds),
          }))
          .filter((cluster) => cluster.realMatchIds.length >= 2);

        setClusters(genuine);
        setIsLoading(false);
```

Replace with:

```typescript
        const raw: PatternCluster[] = Array.isArray(payload.data) ? payload.data : [];

        setClusters(raw);
        setIsLoading(false);
```

Then find:

```typescript
                <span className="text-sm font-semibold text-white">
                  {cluster.realMatchIds.length} real matches
                </span>
```

Replace with:

```typescript
                <span className="text-sm font-semibold text-white">
                  {cluster.matchCount} real matches
                </span>
```

Then find:

```typescript
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
```

Replace with:

```typescript
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cluster.matchIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-stone-400"
                  >
                    Match {id}
                  </span>
                ))}
              </div>
```

- [ ] **Step 2: Simplify `App.tsx`'s analyst-chat handler**

Find:

```typescript
  type PatternClusterReply = {
    side: string;
    severity: string;
    market: string;
    matchIds: string[];
    signalCount: number;
  };

  function baseMatchId(matchId: string): string {
    return matchId.split("-totals-")[0];
  }
```

Replace with:

```typescript
  type PatternClusterReply = {
    side: string;
    severity: string;
    market: string;
    matchIds: string[];
    matchCount: number;
    signalCount: number;
  };
```

Then find:

```typescript
        const payload = await request<unknown>("/api/signal-correlation/patterns");
        const raw = asArray<PatternClusterReply>(payload, ["data"]);
        const genuine = raw.filter(
          (cluster) => new Set(cluster.matchIds.map(baseMatchId)).size >= 2
        );

        if (genuine.length === 0) {
          return "No genuine cross-match signal correlation clusters right now — Signal Correlation looks for the same pattern (side/severity/market) firing across 2+ distinct real matches.";
        }

        const top = genuine[0];
        const distinctRealMatchCount = new Set(top.matchIds.map(baseMatchId)).size;

        return `Signal Correlation found ${genuine.length} genuine cluster(s) across multiple real matches. Top: ${top.side}/${top.severity}/${top.market}, ${top.signalCount} signals across ${distinctRealMatchCount} real matches.`;
      }
```

Replace with:

```typescript
        const payload = await request<unknown>("/api/signal-correlation/patterns");
        const clusters = asArray<PatternClusterReply>(payload, ["data"]);

        if (clusters.length === 0) {
          return "No genuine cross-match signal correlation clusters right now — Signal Correlation looks for the same pattern (side/severity/market) firing across 2+ distinct real matches.";
        }

        const top = clusters[0];

        return `Signal Correlation found ${clusters.length} genuine cluster(s) across multiple real matches. Top: ${top.side}/${top.severity}/${top.market}, ${top.signalCount} signals across ${top.matchCount} real matches.`;
      }
```

- [ ] **Step 3: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no TypeScript errors (confirms no other file references `GenuineCluster`, `distinctRealMatches`, or the deleted `baseMatchId` in either file).

- [ ] **Step 4: Manual verification in a local dev browser**

Start the local backend (`npm run dev:once` in `apps/api`) and frontend (`npm run dev` in `apps/web`), open the app, scroll to the Signal Correlation panel. Confirm: no console errors, cluster cards render with a plausible "N real matches" count and match-id chips. Then use the "Ask GoalPulse" chat and ask a question containing "correlation" or "cluster" — confirm the reply's real-match count matches what the panel shows for the same top cluster. Stop both local dev servers after checking (exact PID, not pattern-kill).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/SignalCorrelationPanel.tsx apps/web/src/App.tsx
git commit -m "Remove client-side correlation dedup now that the backend owns it (P1-3)"
```

---

### Task 3: PROJECT_STATE.md update

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Document P1-3 completion**

Add an entry to `PROJECT_STATE.md`'s session-handoff section covering: the backend dedup fix (both `findSignalClusters` and `findPatternMatchedClusters`), the in-place `matchIds`/`matchCount` semantics change, removal of both client-side workarounds, test/build counts actually observed in Task 1/2, and next action (report diff, user reviews and verifies live — Signal Correlation panel and the chat answer both — before push and before continuing to P1-2).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md
git commit -m "Update PROJECT_STATE.md: P1-3 implemented, awaiting review"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Confirm the Signal Correlation panel and the analyst-chat correlation answer both work correctly against a locally running dev server, with matching real-match counts.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to. Do not start P1-2 until the user has reviewed this live and explicitly approves.
