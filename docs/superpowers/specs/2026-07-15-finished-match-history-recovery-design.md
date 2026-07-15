# Finished Match History Recovery Design

## Goal

Finished fixtures must keep their odds movement, signal evidence, and truthful UI state after they leave the live feed. Selecting Norway vs England or any other finished match must either restore real captured history or clearly explain that TxLINE has no recoverable history.

## Confirmed failure

The production API retained the Norway vs England result but returned zero odds snapshots and zero signals for fixture `18213979`. Eight of the ten recent finished fixtures had the same empty history. The hot store was already at its global limits of 800 snapshots and 100 signals, while only the two hardcoded bootstrap fixtures had recovered history.

## Approaches considered

### Chosen: durable archive plus on-demand recovery

Archive every real TxLINE odds snapshot in Supabase. When a selected finished match has no hot history, hydrate from the archive; if the archive is empty, request that fixture's actual TxLINE odds history, normalize it, archive it, and return it immediately. This repairs both future retention and already-finished fixtures without relying on a growing memory limit.

### Rejected: increase the global memory cap

This delays eviction but does not make history durable across long tournaments, restarts, or larger feeds.

### Rejected: add more hardcoded fixtures

This fixes only fixtures known at development time and repeats the current brittle failure mode.

## Architecture

### `odds_snapshot_archive`

A new private-by-policy public-schema table stores one row per unique snapshot:

- `snapshot_id text primary key`
- `match_id text not null`
- `created_at timestamptz not null`
- `snapshot_data jsonb not null`
- `archived_at timestamptz not null default now()`

An index on `(match_id, created_at asc)` supports selected-match hydration. RLS is enabled. Access is revoked from `anon` and `authenticated`; only `service_role` receives `select` and `insert`. The browser never receives Supabase credentials and continues to use the GoalPulse API.

### Archive service

`archiveOddsSnapshots(snapshots)` deduplicates by snapshot ID and upserts with `ignoreDuplicates`. `getArchivedOddsSnapshots(matchId, limit)` returns chronological typed snapshots. Both operations remain fail-open so a Supabase outage cannot break the live agent.

### Generic TxLINE recovery

`fetchTxLineOddsHistoryForMatch(match)` uses the selected match's real fixture ID. It requests `/api/odds/updates/<fixtureId>` and `/api/odds/snapshot/<fixtureId>`, selects the same exact 1X2 line used by the live normalizer, normalizes snapshots with the existing match identity, deduplicates them, and returns chronological history. It does not require an entry in `RECENT_RESULT_FIXTURES`.

### History resolver

`ensureMatchOddsHistory(matchId)` owns the fallback order:

1. Return matching hot-store snapshots when present.
2. Hydrate from Supabase archive and merge into the hot store.
3. For a known finished match only, recover from TxLINE, merge, and archive.
4. Return an empty list if all real sources are empty or unavailable.

Concurrent requests for the same fixture share one in-flight promise so repeated SSE ticks and browser reconnects do not stampede TxLINE.

### API and stream integration

Both `/api/odds-history` and the initial `/api/live/odds-stream` payload call the resolver. The existing frontend SSE flow therefore receives recovered data without a new browser-side API contract. The stream emits a `historySource` value of `hot`, `archive`, `txline_recovery`, or `unavailable` for honest diagnostics.

### Ongoing durability

The agent archives every newly accepted real snapshot after it enters the hot store. Recent-result bootstrap snapshots use the same archive path. Hot caps remain unchanged because they protect runtime memory; eviction no longer destroys permanent history.

## UI behavior

Finished fixtures with recovered history render the normal price tape and signal markers. A finished fixture with no recoverable snapshots says: “No historical TxLINE odds were available for this finished fixture.” It must not promise a future live update. Scheduled and live fixtures keep the existing waiting copy.

## Error handling

- Supabase read/write failures log server-side and fall through to TxLINE or the hot store.
- TxLINE recovery failures log once per recovery attempt and return a truthful empty result.
- Only finished fixtures trigger historical recovery; live and scheduled requests never backfill historical endpoints.
- No synthetic odds, signals, or field context are generated.

## Testing

- Archive service tests cover deduplicated writes, chronological reads, and fail-open behavior.
- Resolver tests cover hot, archive, TxLINE recovery, unavailable, and concurrent-request paths.
- TxLINE client tests prove arbitrary fixture IDs can be recovered and exact 1X2 selection remains intact.
- API/SSE tests prove a finished fixture receives recovered history.
- UI tests distinguish finished-unavailable copy from live waiting copy.
- Full API and web tests, lint, type builds, Supabase migration verification, and live endpoint verification gate deployment.

## Deployment

Apply the additive Supabase migration first, run security and performance advisors, deploy the Render API through the merged `main` branch, then deploy Vercel. Verify Norway vs England through `/api/odds-history?matchId=18213979` and the public Live Markets page. If TxLINE no longer exposes that fixture, the permanent archive will still protect all snapshots captured after this release and the UI will state the limitation accurately.
