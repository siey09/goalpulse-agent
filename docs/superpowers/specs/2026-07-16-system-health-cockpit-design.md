# System Health Operations Cockpit Design

**Date:** 2026-07-16
**Status:** Approved direction; awaiting written-spec review

## Purpose

Transform System Health from three small reference cards into an issue-first operations cockpit. The page must answer, in one scan:

1. Is GoalPulse healthy now?
2. Which stage is degraded or down?
3. Is live TxLINE data fresh and flowing?
4. Is the agent cycle keeping its expected cadence?
5. Are fixtures, odds, and archive writes being lost or delayed?

Static signal thresholds remain available as reference, but they no longer dominate the page.

## Product Decision

Use real observability already exposed by the backend:

- `/health` for API state, feed mode, scheduler interval, stream counters, and backend timestamp;
- `/api/metrics` for uptime, cycle decision latency, stream status/freshness, reconnects, and dropped duplicates;
- `/api/feed-health` for cycle gaps, stale live odds, and fixture coverage;
- already-fetched stats for archive pending/failure state.

No historical chart is introduced because these endpoints expose current snapshots, not a time series. The cockpit uses status lanes, bounded ratio rails, exact counts, and an incident queue. It never connects current values into a fabricated trend.

## Information Architecture

The page follows this scan order:

`Verdict -> Telemetry -> Pipeline -> Streams -> Incidents -> Threshold reference`

### Desktop layout

```text
+-----------------------------------------------------------------------+
| HEALTHY / DEGRADED / DOWN          reason          last checked       |
+-----------------------------------------------------------------------+
| API uptime | Agent cycle | Odds freshness | Fixture coverage          |
+----------------------------------------------+------------------------+
| System pipeline diagnostic                   | Active incidents       |
| API -> cycle -> fixtures -> odds -> archive  | issue list / all clear |
+----------------------------------------------+------------------------+
| TxLINE push stream          | Live odds stream                       |
+-----------------------------------------------------------------------+
| Signal threshold reference: WATCH | MOMENTUM SHIFT | SHARP MOVE       |
+-----------------------------------------------------------------------+
```

### Tablet and mobile

- Tablet uses a two-column telemetry grid and stacks Pipeline above Incidents.
- Mobile uses one column in the same semantic order.
- Stream cards stack and keep exact counters visible.
- No chart, status rail, or action requires horizontal scrolling at 390 px.

## Visual Direction

System Health should feel like a production control room, distinct from the decision-focused Command Center.

- **Healthy state:** teal is used sparingly for current success.
- **Degraded state:** amber identifies attention without implying outage.
- **Down/error state:** red is reserved for confirmed interruption or failed writes.
- **Unknown/loading state:** neutral gray, never green by default.
- **Typography:** display face for verdict and section titles; monospaced utility text for durations, timestamps, counters, and status codes.
- **Signature element:** a five-stage diagnostic spine connecting API, Agent Cycle, Fixture Coverage, Odds Freshness, and Archive. Each stage is independently labelled and never implies success from color alone.
- **Motion:** a single restrained flow/update transition on the spine and ratio rails. Reduced-motion removes it entirely.

## Data Contracts

### Health

Extend the existing web `Health` type to reflect fields already returned by `/health`:

- `service?: string`;
- `status?: string`;
- `timestamp?: string`;
- `agentIntervalMs?: number`;
- `useSimulatedFeed?: boolean`;
- `liveStream?: LiveStreamState`;
- `liveOddsStream?: LiveStreamState`.

`LiveStreamState` contains:

- `connected?: boolean`;
- `lastEventAt?: string | null`;
- `totalEventsReceived?: number`;
- `totalReconnects?: number`;
- `lastError?: string | null`.

### Metrics

Create a focused `SystemMetrics` type matching `/api/metrics`:

- `uptimeSeconds: number`;
- `lastAgentCycle: { startedAt; finishedAt; decisionLatencyMs } | null`;
- `liveStream` and `liveOddsStream`: `{ connected; staleForMs; totalReconnects; status }`;
- `duplicatesDropped: number`.

Stream status is exactly `STREAMING | STALE | RECONNECTING | STOPPED`.

### Feed health

Create a focused `FeedHealth` type matching `/api/feed-health`:

- `status: healthy | degraded | down`;
- `cycleHealth`: last run, current gap, expected interval, exceeded flag, missed-cycle count;
- `oddsFreshness`: stale threshold, stale-live count, and stale live match details;
- `fixtureCoverage`: raw count, processed count, current drop flag, and recent drop count.

### Archive status

Pass a nullable summary from App's already-fetched stats:

- `pending: number`;
- `failures: number`;
- `lastFailureAt: string | null`.

Missing stats produce an unavailable archive stage, not a false zero.

## Data Flow

`App.tsx` continues to fetch `/health` and stats on its existing cadence. It passes `health` and nullable `archiveStatus` to `SystemHealthPage`.

While the System Health page is mounted, it fetches `/api/metrics` and `/api/feed-health` immediately and every 10 seconds. These two requests run together and update independently:

- a successful metrics response remains visible if feed health fails;
- a successful feed-health response remains visible if metrics fails;
- each panel has its own loading, last-success, and unavailable state;
- unmount aborts in-flight fetches and clears the timer;
- routine polling never clears valid data before the replacement response succeeds.

No endpoint, backend scheduler behavior, or global polling cadence changes.

## Components

### 1. Overall Verdict Banner

Use `/api/feed-health.status` as the primary verdict when available:

- `healthy` -> Healthy;
- `degraded` -> Degraded;
- `down` -> Down.

If feed health is unavailable, fall back to a neutral Checking/Unavailable state. Do not convert `health.ok` into an overall healthy verdict because API availability alone does not prove feed health.

The banner displays:

- verdict label and semantic icon;
- concise reason derived from active incident categories;
- real TxLINE or simulated mode;
- last successful cockpit refresh time.

### 2. Telemetry Cards

Four compact cards:

1. **API uptime:** formatted from `uptimeSeconds`, with API status.
2. **Agent cycle:** current gap, decision latency, and expected interval.
3. **Odds freshness:** stale-live count and the real five-minute threshold.
4. **Fixture coverage:** processed/raw ratio and recent coverage drops.

Ratio rails are used only where a real denominator exists. A missing denominator shows unavailable, not an empty bar.

### 3. Diagnostic Spine

Five stages:

1. API
2. Agent cycle
3. Fixture coverage
4. Odds freshness
5. Archive

Each stage has a deterministic status:

- API uses `health.ok`;
- Agent cycle uses `isCurrentGapExceeded` and `recentMissedCycles`;
- Fixture coverage uses `isCoverageDropped` and `recentCoverageDrops`;
- Odds freshness uses `staleLiveMatchCount`;
- Archive uses failure and pending counts.

Stage precedence is `down/error -> degraded/attention -> healthy -> unknown`. Connecting lines are decorative and hidden from assistive technology.

### 4. Dual Stream Monitor

Show TxLINE Push and Live Odds as equal stream cards. Each displays:

- exact backend stream status;
- connected flag;
- time since last valid event when available;
- total events received from `/health`;
- reconnect count;
- last error, sanitized as existing backend text.

`STOPPED` in simulated mode is explained as intentionally disabled, not an outage. `STALE` and `RECONNECTING` become incidents only when the real feed is enabled.

### 5. Incident Queue

Derive a current issue list from real flags and counts:

- current agent cycle gap exceeded;
- recent missed cycles;
- stale live matches;
- current or recent fixture coverage drops;
- push/odds stream stale or reconnecting when enabled;
- archive failures or pending writes.

Every incident includes severity, plain-language evidence, and the exact relevant count/time. When none exist, show `No active health incidents.` Do not report "all systems healthy" when required endpoint data is unavailable.

### 6. Threshold Reference Strip

Retain WATCH, MOMENTUM SHIFT, and SHARP MOVE with their existing 4%, 8%, and 15% thresholds. Render them as a compact horizontal reference strip at the bottom. Correct the current mojibake and show the actual `>=` symbol.

## Truthfulness Rules

- Never default a missing metric to zero.
- Never call the overall system Healthy without a successful feed-health response.
- Never show a time-series line or trend arrow without historical samples.
- Preserve exact backend stream status labels and explain `STOPPED` in simulated mode.
- Use the backend's five-minute stale threshold and three-times-cycle-gap logic; do not invent new thresholds.
- A fixture processed/raw ratio is shown only when both counts are present.
- Last checked means the last successful cockpit refresh, not component render time.

## Error and Loading States

- Initial metrics loading and feed-health loading are independently labelled.
- After a polling failure, retain the last successful values and mark that source stale/unavailable.
- If both observability endpoints fail and no prior data exists, retain `/health` stream facts but show overall verdict Unavailable.
- A malformed date displays `Time unavailable` and does not throw.
- A fetch error is summarized in operator language; raw stack traces are never rendered.

## Accessibility

- Overall verdict is a named status region.
- Each telemetry card has a visible heading and semantic definition list.
- The diagnostic spine exposes an ordered list with text statuses.
- Incident severity includes a text label, not color alone.
- Stream counters use descriptive labels and tabular numerals.
- Focus indicators remain visible on any action or expandable detail.
- Routine 10-second refreshes do not announce the whole page; only verdict changes use a polite live region.
- Reduced-motion preferences disable flow and meter transitions.

## Testing and Verification

Unit tests cover:

- duration and freshness formatting, including null/invalid values;
- deterministic stage-status precedence;
- incident derivation for every real failure category;
- simulated-feed STOPPED behavior;
- healthy, degraded, down, unavailable, loading, and stale-last-success states;
- independent metrics/feed-health request failure handling;
- polling cleanup and abort behavior;
- null archive stats remaining unavailable;
- no `NaN`, false zero, or false Healthy verdict;
- semantic status, lists, headings, and reduced-motion classes;
- responsive layout classes for desktop, tablet, and 390 px mobile.

Verification includes the full web test suite, lint, TypeScript/Vite production build, and direct inspection at 1440 px, 1024 px, and an exact 390 px emulated viewport when browser tooling permits.

## Out of Scope

- New backend endpoints or storage;
- persistent incident history or time-series charts;
- alerts, paging, email, or Slack notifications;
- changing agent cadence, SSE reconnect logic, or stale thresholds;
- exposing secrets, API keys, or the full TxLINE base URL;
- edits to Command Center or Live Markets.

## Success Criteria

The finished System Health page:

1. materially reduces dead space on desktop and tablet;
2. exposes current API, scheduler, coverage, odds, stream, and archive health;
3. makes the highest-severity issue obvious within one scan;
4. uses only traceable backend facts and documented thresholds;
5. remains useful when one observability source fails;
6. stays accessible and readable from 390 px through wide desktop layouts.
