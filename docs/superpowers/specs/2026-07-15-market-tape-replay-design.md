# Market Tape Replay and Chart Design

## Objective

Turn Live Markets odds history into an honest, competition-ready market tape. The chart must communicate what TxLINE actually observed, distinguish historical replay time from wall-clock time, and make demo playback feel deliberate without inventing intermediate prices or fake timing.

## Findings

- A “tick” currently means one replayed snapshot, not an exchange tick or one second of match time. The label is ambiguous.
- Demo playback emits one snapshot per second regardless of the original interval. This is acceptable as accelerated playback only when the interface says so explicitly.
- The chart uses original capture timestamps in labels, but plots them at equal categorical spacing. That visually misrepresents irregular time gaps.
- Monotone interpolation implies unobserved prices between discrete snapshots.
- Replay restarts from snapshot one after reaching the end, so completion is not a stable state.
- The replay route reads only the hot in-memory store, which can exclude recovered history for older finished fixtures.

## Considered Directions

### 1. Cinematic simulation

Keep equal spacing, smooth curves, and looping playback. This is visually energetic but can imply synthetic timing and values. Rejected because judges may interpret the animation as evidence rather than decoration.

### 2. Literal real-time replay

Wait the original duration between every historical capture. This is maximally faithful but makes a short judging demo unpredictable and sometimes too slow.

### 3. Honest accelerated market tape — selected

Reveal one historical snapshot per second by default while plotting every point at its real capture time. Use a discrete step line, label the playback rate, stop at completion, and retain play/pause/restart controls. This balances evidence integrity with demo pacing.

## Data Semantics

- Replace user-facing “tick” with “snapshot” or “capture.”
- A snapshot is one real TxLINE odds observation.
- The X-axis is historical capture time in the user’s local timezone.
- Horizontal distance reflects the real interval between captures.
- The step line holds the last observed price until the next observation; it does not interpolate an invented path.
- Lower decimal odds continue to mean stronger market favor.
- Demo speed controls wall-clock reveal cadence only. It never modifies original capture timestamps.
- Default cadence is one snapshot per second. Optional rates are 0.5×, 1×, and 2×.

## Replay Behavior

The replay API resolves history through the same hot → archive → TxLINE recovery path as the production history endpoint. It accepts a bounded starting cursor and replay interval, emits snapshots progressively, and stops after the last snapshot.

Each SSE event includes:

- `replayCursor` — number of snapshots currently revealed;
- `replayTotal` — total snapshots in this replay;
- `replayComplete` — true only on the final event;
- `replayOriginalTimestamp` — capture timestamp of the latest revealed snapshot;
- `replayIntervalMs` — wall-clock reveal interval.

Pause closes the EventSource while retaining the cursor. Resume reconnects from that cursor. Restart reconnects from zero. Switching fixtures resets replay state. Empty recovery ends once with a truthful unavailable state.

## Chart Design

The visual direction remains GoalPulse’s dense command-center language: near-black instrument panel, amber home tape, violet draw tape, teal away tape, and restrained monospaced telemetry. The distinctive element is a **historical-time scrub rail** beneath the chart: start time, animated current capture, end time, and a segmented progress track that advances with each real snapshot.

The chart uses:

- numeric timestamp X coordinates with a time scale;
- `stepAfter` series to express discrete observations;
- three series only when their data exists;
- a bright current-capture cursor and subtle terminal dots;
- signal markers revealed only after their source snapshot enters the replay window;
- a compact tooltip containing snapshot number, full historical date/time, all available prices, and signal evidence;
- no full-chart tween on every update, preventing lines from visually sliding through unobserved values;
- short opacity/scale transitions on the newest cursor and scrub rail, disabled under `prefers-reduced-motion`.

The status line reads examples such as:

- `Snapshot 4 of 10 · Historical 10:59:14 PM · 1 snapshot/s`
- `Paused at snapshot 4 of 10`
- `Replay complete · 10 real snapshots`

## Controls

Use one control cluster, not duplicate buttons in multiple panels:

- Play demo / Pause demo
- Restart
- Speed selector: 0.5×, 1×, 2×

Buttons remain keyboard accessible, have visible focus states, announce state changes through a polite live region, and expose disabled states when fewer than two snapshots are available.

## Component Boundaries

- `apps/api/src/services/replayOddsStream.ts`: finite replay state machine and disconnect cleanup.
- `apps/api/src/server.ts`: thin route registration.
- `apps/web/src/features/markets/chartTimeline.ts`: pure conversion from snapshots to time-scaled chart points and display labels.
- `apps/web/src/features/markets/OddsMovementChart.tsx`: time-accurate visualization, cursor, tooltip, and scrub rail.
- `apps/web/src/features/markets/IntelligenceRail.tsx`: single replay control cluster.
- `apps/web/src/App.tsx`: EventSource lifecycle, cursor persistence, speed, pause/resume/restart state.

## Error and Edge Handling

- Invalid cursor and interval query values are clamped to safe bounds.
- Duplicate timestamps remain distinct snapshots but receive stable unique IDs; display collisions do not create React key collisions.
- One snapshot renders as a point with a zero-duration historical window.
- Missing timestamps fall back to ordered snapshot positions and are labeled “Capture time unavailable” rather than receiving invented times.
- Disconnects clear timers before any further write.
- A malformed SSE payload leaves the last valid frame intact and surfaces the existing non-blocking dropped-update notice.

## Verification

- API unit tests prove recovered finished history is replayed, replay ends instead of looping, resume starts at the requested cursor, cadence bounds are enforced, and disconnects clear timers.
- Pure timeline tests prove irregular time gaps map to numeric coordinates, missing timestamps are not fabricated, and duplicate labels remain stable.
- Component tests prove step-series rendering, historical-time labeling, accessible controls/status, finite completion, and reduced-motion behavior.
- Full API tests/build and web tests/lint/build must pass.
- Production verification checks the finished Norway vs England fixture, confirms all archived snapshots appear, and observes a completed finite replay.

## Success Criteria

- Judges can explain, without inference, that points are real historical TxLINE snapshots revealed at an accelerated demo cadence.
- Time gaps, price holds, and signal timing are visually truthful.
- Replay can play, pause, resume, restart, change speed, and finish cleanly.
- The chart feels more alive through the cursor and scrub rail without using misleading continuous motion.
