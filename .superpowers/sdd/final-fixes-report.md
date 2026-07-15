# GoalPulse market tape final fixes

Date: 2026-07-15
Starting head: `daf48c1`
Scope: all Critical/Important final-review findings, classic parity, and the safely scoped 390 px label fix.

## Outcome

The replay now has a single causal timeline from API to chart:

- A signal is absent until its deterministic `evidence.currentSnapshotId` is in the revealed replay history. Legacy signals without a source snapshot use their timestamp as a conservative fallback and are withheld until the replay reaches that time (or completes if no deterministic time exists).
- Replay payload signals live in a replay-only client cache. Periodic dashboard polling can no longer reintroduce future live signals into a historical frame.
- Every EventSource `open`, `odds-update`, `error`, and delayed reconnect callback is guarded by a monotonically increasing connection generation. Cleanup is named, invalidates the generation, cancels reconnect work, and closes the stream.
- Three bounded retries retain their existing 250/500/1000 ms backoff. Exhaustion preserves the last cursor, transitions playback to `paused`, and presents a nonblocking recovery notice with Resume and Restart.
- Replay entry and active playback controls require at least two known real TxLINE snapshots. The count is carried through App, LiveMarketsPage/LiveMarketToolbar, ClassicReplayPanel, and the shared ReplayControls implementation. The explanation is visible and connected to the disabled primary button with `aria-describedby`.
- Replay state/progress copy can wrap at narrow widths instead of compressing the toolbar at 390 px.

## TDD evidence

### Red

1. API source-snapshot regression failed because the first frame contained `signal-at-snapshot-2`; expected no signals until frame two.
2. Shared modern and classic control regressions failed because Play remained enabled with one snapshot and no availability explanation existed.
3. Failure-state regression failed because there was no accessible replay-connection notice.
4. The App fake-EventSource integration initially exposed the dashboard's future signal during replay frame one (`0 signals plotted` was absent).

### Green

- Focused API replay stream: 9/9 tests passed.
- Focused App/shared replay controls: 20/20 tests passed across 3 files.
- The App integration uses a controllable EventSource that can emit queued callbacks after `close()`. It covers stale message/open/error behavior across speed changes, restart/session changes, and fixture changes, plus bounded reconnect exhaustion and cursor retention.

## Implementation notes

### API

`replayOddsStream.ts` builds a visible snapshot-id set for each frame and filters related signals before serialization. This fixes the leak at the data boundary, so every replay consumer receives causally valid evidence.

### Web lifecycle and evidence

`App.tsx` maintains separate live and replay signal collections for the market tape. A connection generation is incremented for each effect instance and invalidated during named cleanup. All asynchronous EventSource and reconnect entry points verify their generation before updating state.

Retry exhaustion does not reset `replayCursorRef`, `replayCursor`, history, or progress. Manual Resume resets the retry budget and starts a fresh generation; Restart intentionally resets progress.

### Controls and parity

`ReplayControls` owns availability, disabled semantics, recovery copy, and the accessible explanation. Modern and classic surfaces pass the same snapshot count and connection-failure state, preventing behavior or copy drift.

## Full verification

| Check | Result |
| --- | --- |
| API tests | 28 files, 305 tests passed |
| Web tests | 27 files, 139 tests passed |
| Total tests | 55 files, 444 tests passed |
| API build | `tsc`, exit 0 |
| Web build | `tsc -b && vite build`, exit 0 |
| Web lint | `eslint .`, exit 0 |
| Diff whitespace | `git diff --check`, exit 0 (line-ending notices only) |

## Limitations and concerns

- The API package has no lint script, so API static verification is TypeScript build plus its 305-test suite. Web lint covers all changed browser code.
- Vite reports that the main minified chunk exceeds 500 kB (760.51 kB, 212.85 kB gzip). Resolving the broader split is outside this replay correctness scope.
- Signals lacking both `currentSnapshotId` and a parseable creation time are deliberately withheld until replay completion. That is the safe no-future-evidence behavior, but old archived records should ideally be backfilled with source snapshot IDs.

## Recommended next step

Backfill `evidence.currentSnapshotId` for any legacy archived signals that lack it, then add a production telemetry counter for timestamp-fallback and completion-only reveals. That will make the conservative compatibility path measurable and eventually removable.
