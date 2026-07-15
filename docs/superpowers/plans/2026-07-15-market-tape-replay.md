# Market Tape Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the looping, equally spaced demo chart with a finite, resumable, time-accurate historical market tape using real TxLINE snapshots.

**Architecture:** Move replay behavior into a tested API handler that hydrates through `ensureMatchOddsHistory`, emits a finite SSE sequence, and accepts safe cursor/cadence parameters. Convert snapshots through a pure web timeline module, then render numeric historical time with discrete step series while `App.tsx` owns replay lifecycle and `LiveMarketToolbar` owns the single control cluster.

**Tech Stack:** TypeScript 6, Express 5 SSE, React 19, Recharts 3, Tailwind CSS 4, Vitest 4, Testing Library.

## Global Constraints

- Every plotted value must come from a real TxLINE snapshot; do not interpolate synthetic odds.
- Default replay cadence is 1,000 ms per snapshot; supported UI speeds are 0.5× (2,000 ms), 1× (1,000 ms), and 2× (500 ms).
- Original capture timestamps never change when playback speed changes.
- Replay stops after the final snapshot and never loops automatically.
- Historical capture time must be labeled separately from wall-clock stream update time.
- All motion must respect `prefers-reduced-motion`.
- No new runtime dependency.

---

### Task 1: Finite, recoverable replay SSE service

**Files:**
- Create: `apps/api/src/services/replayOddsStream.ts`
- Create: `apps/api/src/services/replayOddsStream.test.ts`
- Modify: `apps/api/src/server.ts:211-289`

**Interfaces:**
- Consumes: `ensureMatchOddsHistory(matchId): Promise<MatchHistoryResult>`, `store.matches`, `store.recentFinishedMatches`, `store.signals`, and `getStats()`.
- Produces: `createReplayOddsStreamHandler(overrides?): (req, res) => Promise<void>` and `parseReplayStreamParams(query): { startCursor: number; intervalMs: number }`.

- [ ] **Step 1: Write failing replay service tests**

Cover these exact behaviors in `replayOddsStream.test.ts`:

```ts
it("replays recovered finished history and stops on the final snapshot", async () => {
  const handler = createReplayOddsStreamHandler({
    ensureMatchOddsHistory: vi.fn().mockResolvedValue({ history: [older, newer], source: "archive" }),
    setInterval: schedule.capture,
    clearInterval: schedule.clear,
  });
  await handler(request({ matchId: "m1" }), response);
  schedule.tick();
  expect(payloads(response)).toMatchObject([
    { replayCursor: 1, replayTotal: 2, replayComplete: false },
    { replayCursor: 2, replayTotal: 2, replayComplete: true },
  ]);
  expect(schedule.clear).toHaveBeenCalled();
  expect(response.end).toHaveBeenCalled();
});
```

Also assert: `startCursor=1` resumes with the second snapshot; intervals clamp to 500–2,000 ms; an empty history emits one completed event; and a client close before hydration prevents writes/timers.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm.cmd test -- src/services/replayOddsStream.test.ts`

Expected: FAIL because `replayOddsStream.ts` does not exist.

- [ ] **Step 3: Implement the finite replay handler**

Implement parameter parsing with integer clamping, register `close` before awaiting hydration, emit the first frame immediately, schedule only when more frames remain, and clear/end exactly once after the final frame. Every payload includes:

```ts
{
  streamMode: "replay_test",
  historySource: resolved.source,
  replayCursor: visibleCount,
  replayTotal: history.length,
  replayComplete: visibleCount >= history.length,
  replayOriginalTimestamp: latestSnapshot?.createdAt ?? latestSnapshot?.timestamp ?? null,
  replayIntervalMs: intervalMs,
}
```

- [ ] **Step 4: Replace the inline server route**

Import `createReplayOddsStreamHandler` and register:

```ts
app.get("/api/live/replay-stream", createReplayOddsStreamHandler());
```

Delete the old looping route without changing `/api/live/odds-stream`.

- [ ] **Step 5: Verify and commit Task 1**

Run:

```powershell
npm.cmd test -- src/services/replayOddsStream.test.ts src/services/matchHistory.test.ts src/services/liveOddsStream.test.ts
npm.cmd run build
```

Expected: all focused tests pass and TypeScript exits 0.

Commit: `feat(api): make odds replay finite and recoverable`

---

### Task 2: Truthful historical timeline model

**Files:**
- Create: `apps/web/src/features/markets/chartTimeline.ts`
- Create: `apps/web/src/features/markets/chartTimeline.test.ts`
- Modify: `apps/web/src/features/markets/LiveMarketsPage.tsx:7-29`
- Modify: `apps/web/src/App.tsx:1096-1178`

**Interfaces:**
- Consumes: `OddsSnapshot[]`, a `Set<string>` of signal-adjacent snapshot IDs, and a maximum non-signal count.
- Produces:

```ts
export interface MarketTimelinePoint {
  id: string;
  name: string;
  timelineX: number;
  hasRealTimestamp: boolean;
  rawTimestamp: string;
  snapshotLabel: string;
  timelineLabel: string;
  home?: number;
  draw?: number;
  away?: number;
}

export function buildMarketTimeline(
  snapshots: OddsSnapshot[],
  mustKeepIds?: Set<string>,
  maxNonSignalPoints?: number
): MarketTimelinePoint[];
```

- [ ] **Step 1: Write failing pure timeline tests**

Assert that irregular captures at 10:00, 10:01, and 10:10 produce numeric `timelineX` gaps of one minute and nine minutes; input is sorted chronologically; original timestamps and all three price series are preserved; duplicate display times keep unique IDs; signal-adjacent snapshots survive the 18-point cap; and missing timestamps use ordered plot positions while displaying `Capture time unavailable`.

- [ ] **Step 2: Run the timeline test and confirm RED**

Run: `npm.cmd test -- src/features/markets/chartTimeline.test.ts`

Expected: FAIL because `buildMarketTimeline` is missing.

- [ ] **Step 3: Implement the pure timeline builder**

Use `snapshot.timestamp ?? snapshot.createdAt`, `Date.parse`, and stable original indexes. For missing timestamps, assign an order-only `timelineX` after the preceding point but keep `hasRealTimestamp: false`; never format that value as a date. Deduplicate by snapshot ID and retain the latest 18 non-signal points plus required signal points.

- [ ] **Step 4: Integrate the builder into App**

Replace the inline chart mapping with `buildMarketTimeline(oddsHistory, mustKeepIds, 18)`. Change signal marker X values from `nearestPoint.name` to `nearestPoint.timelineX`, and update `LiveMarketsChartMarker.x` to `number` and `LiveMarketsChartPoint` to extend `MarketTimelinePoint`.

- [ ] **Step 5: Verify and commit Task 2**

Run:

```powershell
npm.cmd test -- src/features/markets/chartTimeline.test.ts
npm.cmd run build
```

Commit: `feat(web): model odds history on real capture time`

---

### Task 3: Market-tape chart and restrained animation

**Files:**
- Modify: `apps/web/src/features/markets/OddsMovementChart.tsx`
- Modify: `apps/web/src/features/markets/OddsMovementChart.test.tsx`

**Interfaces:**
- Consumes: time-scaled `LiveMarketsChartPoint[]`, numeric `LiveMarketsChartMarker.x`, replay state, and progress.
- Produces: an accessible step chart with historical-time axis, latest-capture cursor, tooltip, and scrub rail.

- [ ] **Step 1: Add failing component tests**

Add assertions that the chart:

```ts
expect(screen.getByText(/Historical capture time/i)).toBeInTheDocument();
expect(screen.getByRole("status", { name: /replay position/i })).toHaveTextContent(
  /Snapshot 2 of 3.*Historical/i
);
expect(screen.getByText(/Observed price holds until the next snapshot/i)).toBeInTheDocument();
```

Also keep existing draw-series, signal action, collision-safe key, chart naming, and finished-empty tests green. Mock or inspect Recharts props to assert every rendered price series uses `type="stepAfter"`, the X axis uses `timelineX`, `type="number"`, and `scale="time"`, and animation is disabled for the price areas.

- [ ] **Step 2: Run the component test and confirm RED**

Run: `npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx`

Expected: FAIL on missing historical-time semantics and step-series configuration.

- [ ] **Step 3: Implement the time-accurate chart**

Use a numeric `XAxis`:

```tsx
<XAxis
  dataKey="timelineX"
  type="number"
  scale="time"
  domain={["dataMin", "dataMax"]}
  tickFormatter={formatHistoricalAxisTime}
/>
```

Render Home, Draw, and Away with `type="stepAfter"` and `isAnimationActive={false}`. Keep the existing restrained palette, reduce grid contrast, and render a bright vertical current-capture cursor plus terminal dots. Animate only the newest cursor and scrub fill using `motion-safe` opacity/scale transitions; apply `motion-reduce:transition-none` and no pulse under reduced motion.

- [ ] **Step 4: Upgrade tooltip and historical scrub rail**

Tooltip content shows snapshot number, full local historical date/time, all available odds, and signal evidence. The rail shows historical start/current/end labels, segmented progress, and a polite replay-position status. For missing times, use `Capture time unavailable`.

- [ ] **Step 5: Verify and commit Task 3**

Run:

```powershell
npm.cmd test -- src/features/markets/OddsMovementChart.test.tsx src/features/markets/LiveMarketsPage.smoke.test.tsx
npm.cmd run lint
npm.cmd run build
```

Commit: `feat(web): render an honest animated market tape`

---

### Task 4: Play, pause, resume, restart, speed, and completion state

**Files:**
- Create: `apps/web/src/features/markets/replayState.ts`
- Create: `apps/web/src/features/markets/replayState.test.ts`
- Modify: `apps/web/src/App.tsx:269-276, 808-910, 1350-1385`
- Modify: `apps/web/src/features/markets/LiveMarketToolbar.tsx`
- Modify: `apps/web/src/features/markets/LiveMarketToolbar.test.tsx`
- Modify: `apps/web/src/features/markets/LiveMarketsPage.tsx`
- Modify: `apps/web/src/features/markets/LiveMarketsPage.smoke.test.tsx`

**Interfaces:**
- Produces `ReplayStatus = "live" | "playing" | "paused" | "complete"` and:

```ts
export function replayIntervalForSpeed(speed: 0.5 | 1 | 2): 2000 | 1000 | 500;
export function replayProgressLabel(input: {
  status: ReplayStatus;
  cursor: number;
  total: number;
  originalTimestamp?: string;
  intervalMs: number;
}): string;
```

- [ ] **Step 1: Write failing replay-state and toolbar tests**

Pure tests assert exact interval mapping and labels:

- playing: `Snapshot 4 of 10 · Historical 10:59:14 PM · 1 snapshot/s`;
- paused: `Paused at snapshot 4 of 10`;
- complete: `Replay complete · 10 real snapshots`.

Toolbar tests click Play, Pause, Resume, Restart, Live feed, and each speed option; they assert the right callback and a polite live-region state. Controls are keyboard buttons and the speed select has an accessible name.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm.cmd test -- src/features/markets/replayState.test.ts src/features/markets/LiveMarketToolbar.test.tsx
```

- [ ] **Step 3: Implement replay state and toolbar controls**

Add toolbar props for `replayStatus`, `replaySpeed`, `onPlayReplay`, `onPauseReplay`, `onRestartReplay`, `onExitReplay`, and `onChangeReplaySpeed`. Replace “Last tick” with “Last feed update.” Show only one primary replay action, Restart and Live feed when replay is active, and the 0.5×/1×/2× selector.

- [ ] **Step 4: Implement EventSource lifecycle in App**

Track cursor, total, original timestamp, speed, and status. Build replay URLs with:

```ts
const replayParams = new URLSearchParams({
  matchId: selectedMatchId,
  startCursor: String(replayCursor),
  intervalMs: String(replayIntervalForSpeed(replaySpeed)),
});
```

Do not open EventSource while paused or complete. On final payload set `complete`; on Pause retain cursor; on Resume reconnect at cursor; on Restart reset cursor/history then reconnect at zero; on fixture change reset replay state; on Live feed return to the standard SSE route.

- [ ] **Step 5: Thread props through LiveMarketsPage and update smoke coverage**

Pass the control callbacks and replay metadata to `LiveMarketToolbar` and `OddsMovementChart`. Verify the selected fixture identity remains stable through replay state changes.

- [ ] **Step 6: Verify and commit Task 4**

Run:

```powershell
npm.cmd test -- src/features/markets/replayState.test.ts src/features/markets/LiveMarketToolbar.test.tsx src/features/markets/LiveMarketsPage.smoke.test.tsx
npm.cmd run lint
npm.cmd run build
```

Commit: `feat(web): add controlled historical replay playback`

---

### Task 5: Full verification, visual critique, and production proof

**Files:**
- Modify only files required by issues discovered during verification.

**Interfaces:**
- Consumes the completed API and web feature.
- Produces evidence that the complete browser → API → archive → replay → chart flow works.

- [ ] **Step 1: Run all automated checks**

API:

```powershell
npm.cmd test
npm.cmd run build
```

Web:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: zero failures and zero lint/type errors. Record the existing Vite chunk-size warning separately if it remains.

- [ ] **Step 2: Inspect responsive and reduced-motion states**

Run the app and inspect Live Markets at desktop (1440×900), tablet (1024×768), and mobile (390×844). Verify labels do not overlap, the tooltip stays inside the viewport, controls wrap cleanly, focus states are visible, and reduced-motion removes cursor/progress transitions.

- [ ] **Step 3: Verify the Norway vs England end-to-end story**

Select fixture `18213979`, start demo, confirm the first frame contains one archived/recovered snapshot, pause after at least two snapshots, resume without returning to one, change speed, and observe a stable `Replay complete` state after all ten snapshots. Confirm displayed capture times match `/api/odds-history?matchId=18213979`.

- [ ] **Step 4: Request independent review and fix all Critical/Important findings**

Review data truthfulness, timer/disconnect cleanup, replay resume off-by-one behavior, time-scale chart semantics, accessibility, and visual density. Rerun focused checks after every fix.

- [ ] **Step 5: Publish and deploy**

Push `codex/chart-replay-upgrade`, create a ready PR to `main`, wait for backend/frontend/Vercel checks, squash-merge, then verify the production API finite replay and deployed Live Markets bundle.

Commit any final verification fixes as: `fix: harden market tape replay`
