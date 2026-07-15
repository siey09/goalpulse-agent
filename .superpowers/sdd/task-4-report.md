# Task 4 report — controlled historical replay playback

## Scope delivered

- Added pure replay status/speed/progress primitives with exact 0.5×, 1×, and 2× interval mapping.
- Replaced the toolbar replay toggle with Play/Pause/Resume, Restart, Live feed, and an accessible speed selector in one control cluster.
- Added a polite replay-state live region and renamed “Last tick” to “Last feed update.”
- Made the App SSE lifecycle finite: live and playing create one EventSource; paused and complete create none; resume and speed changes reconnect from the retained cursor; restart clears replay history and reconnects at cursor zero; fixture changes return to live state.
- Threaded structured status, cursor, total, original timestamp, and interval metadata through `LiveMarketsPage` into `OddsMovementChart`.
- Removed replay cursor/total regex parsing from the chart and added direct cursor/motion assertions.

## RED evidence

Command:

```powershell
npm.cmd test -- src/features/markets/replayState.test.ts src/features/markets/LiveMarketToolbar.test.tsx src/features/markets/OddsMovementChart.test.tsx src/features/markets/LiveMarketsPage.smoke.test.tsx
```

Observed before production implementation:

- `replayState.test.ts`: suite failed because `./replayState` did not exist.
- Toolbar: 8 failures for missing Play/Pause/Resume/Restart/Live feed/speed controls and old “Last tick” copy.
- Chart: 2 failures because structured `replayCursor`/`replayTotal` were ignored and the old regex fallback reported `2 of 2` instead of `2 of 3`.
- Summary: 3 failed files, 10 failed tests, 18 passed tests.

These failures were the expected missing-feature failures, not test setup failures (apart from the intentionally absent new module).

## GREEN evidence

First focused GREEN after implementation:

```text
Test Files  4 passed (4)
Tests       34 passed (34)
```

Focused verification after adding direct structured cursor/motion coverage:

```text
Test Files  4 passed (4)
Tests       35 passed (35)
```

Full web verification before commit:

- `npm.cmd test`: 24 files passed, 131 tests passed.
- `npm.cmd run lint`: exit 0, no lint findings.
- `npm.cmd run build`: exit 0; TypeScript and Vite production build succeeded. Vite retains the pre-existing informational large-chunk warning for the main bundle.

## Self-review

- Cursor state is mirrored in a ref specifically so normal replay ticks do not enter the EventSource effect dependency list and reopen the stream on every payload.
- Replay session generation is separate from cursor state so Restart always forces a fresh connection even when already playing.
- Completion is driven only by the server’s final `replayComplete` payload; the final real history remains visible.
- The selected fixture ID is not changed by playback controls; the smoke test rerenders playing → paused and confirms fixture identity and no selection callback.
- No raw malformed payload is exposed; existing dropped-update behavior is preserved.

## Remaining concern

- The App’s EventSource transitions are verified through code inspection plus component/pure-state tests; this repository has no isolated App-level EventSource harness. A future extraction into a dedicated replay-stream hook would make connection-count assertions inexpensive, but that refactor is outside Task 4’s requested scope.
