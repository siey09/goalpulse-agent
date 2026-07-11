# P1-7 Event Latency Proxy Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate the already-computed per-signal event/tick timestamp gap into a summary metric, honestly labeled as a proxy for real reaction latency (not the full "event received → market first moved → adjustment completed → expected vs observed shift" pipeline, which needs infrastructure this item explicitly does not build).

**Architecture:** A new pure function (`summarizeEventLatency`) computes percentile stats from `ArchiveEntry[]`, following the exact pattern of the existing `summarizeSignalTypePerformance`/`summarizeConfidenceScorePerformance` in `logic/signalPerformance.ts`. A new route in the same `/api/signal-performance/*` family exposes it. A new section in the existing `SignalPerformancePanel.tsx` renders it, including the negative-gap caveat as visible text.

**Tech Stack:** TypeScript, Vitest (backend), React/TypeScript (frontend, no test runner).

## Global Constraints

- This is a proxy metric, not the real 4-stage reaction-latency pipeline — every place it appears (code comment, API response shape, frontend copy) must make that explicit, not imply more than it measures.
- `negativeGapCount`/`negativeGapPct` must be reported, never silently filtered out — the real archive showed 32% negative gaps at investigation time, a genuine data-quality fact, not a bug to hide.
- `summarizeEventLatency` returns `null` (not a zeroed placeholder object) when there are zero qualifying entries.
- Verify backend with `npm run test && npm run build` from `apps/api` after the backend task; verify frontend with `npm run build` from `apps/web` after the frontend task.

---

### Task 1: `logic/eventLatency.ts`

**Files:**
- Create: `apps/api/src/logic/eventLatency.ts`
- Create: `apps/api/src/logic/eventLatency.test.ts`

**Interfaces:**
- Produces: `EventLatencySummary` interface and `summarizeEventLatency(entries: ArchiveEntry[]): EventLatencySummary | null`, consumed by Task 2's route.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/logic/eventLatency.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { summarizeEventLatency } from "./eventLatency";
import type { AgentSignal, ArchiveEntry } from "../types";

function makeAgentSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    signalId: "signal-1",
    event: "created",
    matchId: "match-1",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    resultStatus: "pending",
    momentumScore: 50,
    oddsChangePct: 20,
    archivedAt: new Date().toISOString(),
    signalData: makeAgentSignal(),
    ...overrides,
  };
}

describe("summarizeEventLatency", () => {
  it("returns null when no entries have both timestamps", () => {
    const entries = [
      makeEntry({ signalData: makeAgentSignal({ evidence: undefined }) }),
    ];

    expect(summarizeEventLatency(entries)).toBeNull();
  });

  it("excludes entries missing either timestamp from the sample", () => {
    const withBoth = makeEntry({
      signalId: "signal-with-both",
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:03.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:00.000Z" },
        },
      }),
    });
    const missingScoresContext = makeEntry({
      signalId: "signal-missing-context",
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:03.000Z",
        },
      }),
    });

    const result = summarizeEventLatency([withBoth, missingScoresContext]);

    expect(result?.sampledCount).toBe(1);
  });

  it("computes a positive gap as-is and reports zero negative gaps", () => {
    const entry = makeEntry({
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          currentTimestamp: "2026-07-11T12:00:05.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:00.000Z" },
        },
      }),
    });

    const result = summarizeEventLatency([entry]);

    expect(result?.sampledCount).toBe(1);
    expect(result?.medianGapMs).toBe(5000);
    expect(result?.negativeGapCount).toBe(0);
    expect(result?.negativeGapPct).toBe(0);
  });

  it("reports a negative gap using its absolute value, but counts it as negative", () => {
    const entry = makeEntry({
      signalData: makeAgentSignal({
        evidence: {
          source: "txline",
          // currentTimestamp is BEFORE scoresContext.timestamp - a
          // feed-polling artifact, not real precognition.
          currentTimestamp: "2026-07-11T12:00:00.000Z",
          scoresContext: { timestamp: "2026-07-11T12:00:08.000Z" },
        },
      }),
    });

    const result = summarizeEventLatency([entry]);

    expect(result?.sampledCount).toBe(1);
    expect(result?.medianGapMs).toBe(8000);
    expect(result?.negativeGapCount).toBe(1);
    expect(result?.negativeGapPct).toBe(100);
  });

  it("computes percentiles correctly across a known small set", () => {
    const gapsMs = [1000, 2000, 3000, 4000, 5000];
    const entries = gapsMs.map((gapMs, index) =>
      makeEntry({
        signalId: `signal-${index}`,
        signalData: makeAgentSignal({
          evidence: {
            source: "txline",
            currentTimestamp: new Date(gapMs).toISOString(),
            scoresContext: { timestamp: new Date(0).toISOString() },
          },
        }),
      })
    );

    const result = summarizeEventLatency(entries);

    expect(result?.sampledCount).toBe(5);
    expect(result?.medianGapMs).toBe(3000);
    expect(result?.p25GapMs).toBe(2000);
    expect(result?.p75GapMs).toBe(4000);
    expect(result?.negativeGapCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api`: `npx vitest run src/logic/eventLatency.test.ts`
Expected: FAIL — the module `./eventLatency` doesn't exist yet.

- [ ] **Step 3: Implement `logic/eventLatency.ts`**

Create `apps/api/src/logic/eventLatency.ts`:

```typescript
import type { ArchiveEntry } from "../types";

export interface EventLatencySummary {
  sampledCount: number;
  medianGapMs: number;
  p25GapMs: number;
  p75GapMs: number;
  negativeGapCount: number;
  negativeGapPct: number;
}

/**
 * Proxy metric only - NOT the real "event received -> market first
 * moved -> adjustment completed -> expected vs observed shift"
 * pipeline (P1-7's literal ask). That would require a raw field-event
 * stream and a raw odds-tick stream, correlated and scanned in
 * sequence (closer to steamDetection.ts's approach than a single-tick
 * comparison), plus a real-data-calibrated expected-shift baseline -
 * confirmed too large to build now (2026-07-11 investigation).
 *
 * This instead aggregates the gap scoresContextFreshness.ts already
 * computes per-signal (with Math.abs(), for the same reason as here)
 * between evidence.scoresContext.timestamp (whichever TXODDS Scores
 * event ended up attached to the signal) and evidence.currentTimestamp
 * (the odds tick that triggered it). A real fraction of these gaps are
 * negative - the event timestamp technically after the tick. This is
 * NOT the market reacting before the event; TXODDS Scores and TxLINE
 * odds are two independently-polled feeds that don't align perfectly
 * in time. Real archive data at investigation time: 102/314 (32%)
 * negative. Reported honestly via negativeGapCount/negativeGapPct,
 * never filtered out.
 */
export function summarizeEventLatency(entries: ArchiveEntry[]): EventLatencySummary | null {
  const gaps: number[] = [];
  let negativeGapCount = 0;

  for (const entry of entries) {
    const eventTimestamp = entry.signalData?.evidence?.scoresContext?.timestamp;
    const tickTimestamp = entry.signalData?.evidence?.currentTimestamp;
    if (!eventTimestamp || !tickTimestamp) continue;

    const gapMs = new Date(tickTimestamp).getTime() - new Date(eventTimestamp).getTime();
    if (gapMs < 0) negativeGapCount += 1;
    gaps.push(Math.abs(gapMs));
  }

  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);

  const percentile = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];

  return {
    sampledCount: gaps.length,
    medianGapMs: percentile(0.5),
    p25GapMs: percentile(0.25),
    p75GapMs: percentile(0.75),
    negativeGapCount,
    negativeGapPct: Math.round((negativeGapCount / gaps.length) * 100),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/logic/eventLatency.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Full backend test run and build**

Run from `apps/api`: `npm run test && npm run build`
Expected: all tests pass (242 existing + 5 new = 247), clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logic/eventLatency.ts apps/api/src/logic/eventLatency.test.ts
git commit -m "Add event-to-signal latency proxy metric logic (P1-7)"
```

---

### Task 2: Route + OpenAPI docs

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: `summarizeEventLatency` from Task 1.

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, find:

```typescript
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./logic/signalPerformance";
```

Replace with:

```typescript
import {
  summarizeConfidenceScorePerformance,
  summarizeSignalTypePerformance,
} from "./logic/signalPerformance";
import { summarizeEventLatency } from "./logic/eventLatency";
```

- [ ] **Step 2: Add the route**

Find:

```typescript
app.get("/api/signal-performance/by-confidence", async (_req, res) => {
  const result = await getArchivedSignals({ event: "settled" }, { page: 1, pageSize: 500 });
  const performance = summarizeConfidenceScorePerformance(result.data);

  res.json({
    data: performance,
    summary: {
      settledSignalsScanned: result.data.length,
      bucketsReported: performance.length,
    },
  });
});
```

Insert immediately after it:

```typescript

app.get("/api/signal-performance/event-latency", async (_req, res) => {
  const result = await getArchivedSignals({ event: "created" }, { page: 1, pageSize: 500 });
  const latency = summarizeEventLatency(result.data);

  res.json({
    data: latency,
    summary: {
      createdSignalsScanned: result.data.length,
    },
  });
});
```

- [ ] **Step 3: Verify build**

Run from `apps/api`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification against a running dev server**

Run `npm run dev:once` in `apps/api`, then from another terminal:

```bash
curl -s http://localhost:4000/api/signal-performance/event-latency | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2))"
```

Expected: a JSON object with `data` either `null` (if the freshly-started local store has no archived signals with both timestamps yet — expected on a fresh process, not a failure) or an `EventLatencySummary` object with `sampledCount`/`medianGapMs`/`p25GapMs`/`p75GapMs`/`negativeGapCount`/`negativeGapPct`. Stop the local API server after checking (exact PID, not pattern-kill).

- [ ] **Step 5: Add the OpenAPI entry**

Read `openapi.yaml`, find the `/api/signal-performance/by-confidence` path entry, and add a new `/api/signal-performance/event-latency` entry immediately after it, following the exact same structure (summary, description explicitly noting this is a proxy metric not the real reaction-latency pipeline, 200 response schema matching `EventLatencySummary`'s fields with `data` marked `nullable: true`).

- [ ] **Step 6: Verify `/api/docs` still resolves**

With the dev server running again (`npm run dev:once`): `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/docs/`
Expected: `200`. Stop the local API server after checking.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/server.ts openapi.yaml
git commit -m "Add GET /api/signal-performance/event-latency route (P1-7)"
```

---

### Task 3: Frontend — `SignalPerformancePanel.tsx`

**Files:**
- Modify: `apps/web/src/components/SignalPerformancePanel.tsx`

**Interfaces:**
- Consumes: `GET /api/signal-performance/event-latency`'s `data: EventLatencySummary | null` response.

- [ ] **Step 1: Add the type and state**

Find:

```typescript
type SignalTypePerformance = {
  signalType: string;
  settledCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
};
```

Insert immediately after it:

```typescript

type EventLatencySummary = {
  sampledCount: number;
  medianGapMs: number;
  p25GapMs: number;
  p75GapMs: number;
  negativeGapCount: number;
  negativeGapPct: number;
};
```

Find:

```typescript
export function SignalPerformancePanel() {
  const [performance, setPerformance] = useState<SignalTypePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
```

Replace with:

```typescript
export function SignalPerformancePanel() {
  const [performance, setPerformance] = useState<SignalTypePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventLatency, setEventLatency] = useState<EventLatencySummary | null>(null);
  const [isLatencyLoading, setIsLatencyLoading] = useState(true);
```

- [ ] **Step 2: Add the fetch effect**

Find:

```typescript
    loadPerformance();

    return () => {
      isActive = false;
    };
  }, []);
```

Replace with:

```typescript
    loadPerformance();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadEventLatency() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/signal-performance/event-latency`);

        if (!response.ok) throw new Error("Unable to load event latency");

        const payload = await response.json();

        if (!isActive) return;

        setEventLatency(payload.data ?? null);
        setIsLatencyLoading(false);
      } catch (error) {
        console.error("Failed to load event latency", error);
        if (!isActive) return;
        setIsLatencyLoading(false);
      }
    }

    loadEventLatency();

    return () => {
      isActive = false;
    };
  }, []);
```

- [ ] **Step 3: Render the new section**

Find:

```typescript
          ))
        )}
      </div>
    </div>
  );
}
```

Replace with:

```typescript
          ))
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          Event-to-signal latency (proxy metric)
        </p>
        {isLatencyLoading ? (
          <p className="mt-2 text-sm text-stone-400">Loading...</p>
        ) : !eventLatency ? (
          <p className="mt-2 text-sm text-stone-400">
            No signals with both timestamps yet.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-stone-300">
              Median gap between a signal's attached TXODDS event and its
              triggering odds tick:{" "}
              <span className="font-semibold text-white">
                {(eventLatency.medianGapMs / 1000).toFixed(1)}s
              </span>{" "}
              (p25 {(eventLatency.p25GapMs / 1000).toFixed(1)}s, p75{" "}
              {(eventLatency.p75GapMs / 1000).toFixed(1)}s, n=
              {eventLatency.sampledCount}).
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Not a true "market reaction time" - this is the gap between
              whichever event ended up attached to a signal and that
              signal's own tick. {eventLatency.negativeGapPct}% of samples
              show a negative gap, a feed-polling artifact between TXODDS
              Scores and TxLINE odds (two independently-polled feeds), not
              the market reacting before the event.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Manual verification in a local dev browser**

Start the local backend (`npm run dev:once` in `apps/api`) and frontend (`npm run dev` in `apps/web`), open the app, scroll to the Signal Performance panel. Confirm: no console errors, the new "Event-to-signal latency" section renders either the empty state or real numbers with the negative-gap caveat visible as plain text (not hidden). Stop both local dev servers after checking (exact PIDs, not pattern-kill).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SignalPerformancePanel.tsx
git commit -m "Display event-to-signal latency proxy metric (P1-7)"
```

---

### Task 4: PROJECT_STATE.md update

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Document P1-7 completion**

Add an entry to `PROJECT_STATE.md`'s session-handoff section covering: the reframing from the literal 4-stage pipeline to the proxy metric and why (infrastructure gap, comparable scope to P1-1), the real investigation numbers (633 signals, 314 with both timestamps, 32% negative gaps), the implementation, test/build counts observed in Tasks 1-3, and next action (report diff, user reviews and verifies live, then explicitly approves before push and before P1-16).

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATE.md
git commit -m "Update PROJECT_STATE.md: P1-7 implemented, awaiting review"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Confirm `GET /api/signal-performance/event-latency` and the new panel section both work correctly against a locally running dev server.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to. Do not start P1-16 without the user's explicit go-ahead, given they flagged it as the biggest remaining item and asked to be told before starting if it risks destabilizing the demo.
