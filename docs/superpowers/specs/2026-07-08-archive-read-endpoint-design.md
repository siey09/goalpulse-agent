# GET /api/archive — Signal Archive Read Endpoint Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

`signal_archive` (Supabase, `apps/api/src/services/archive.ts`) has been insert-only
since it was added: `archiveSignal()` writes one row when a signal is created and
another when it's settled, but there is no way to read the data back except by
browsing the Supabase table directly. This is a real missing capability, not a
demo-polish gap — the archive exists specifically so signal history survives the
in-memory store's caps and TxLINE's own live-rotation window as the World Cup
narrows toward its July 19 final, and right now that accumulating data is
unqueryable from the API.

## Goal

Add `GET /api/archive`: a paginated, filterable read endpoint over
`signal_archive`, following this codebase's existing route/response conventions.

## Row shape: raw event-log rows

`signal_archive` is insert-only by design — each row is an honest,
point-in-time record of one lifecycle event (`created` or `settled`) for a
signal. The endpoint returns these rows as-is, unmodified: a signal typically
appears twice (once per event), and a signal that never settles (see the
archive's known limitation: a signal aging out of the in-memory store's
100-cap before its match finishes) simply has no `settled` row. No
collapsing/DISTINCT ON logic — the caller filters by `event=settled` if they
only want final outcomes.

## Query parameters

```
GET /api/archive?page=1&pageSize=25&matchId=<id>&status=pending|correct|incorrect&market=1x2|totals&event=created|settled
```

All parameters are optional; omitting a filter means "don't filter on it" —
consistent with existing routes like `GET /api/odds-history?matchId=...`.

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | Clamped to `>= 1` on invalid/negative input, not an error. |
| `pageSize` | `25` | Clamped to `1..100` on invalid input. |
| `matchId` | (none) | Exact match against the `match_id` column. |
| `status` | (none) | Exact match against `result_status` (`pending`/`correct`/`incorrect`). |
| `market` | (none) | Inferred from `match_id`, not a stored column (see below). |
| `event` | (none) | Exact match against `event` (`created`/`settled`). |

### Market inference

There is no dedicated `market` column. Per the existing multi-market
convention (`apps/api/src/agent.ts`, `arena.ts`'s `isTotalsSignal`,
`store.ts`'s settlement logic), Over/Under totals signals use a `matchId` of
the form `<fixtureId>-totals-<line>`. `market=totals` matches `match_id LIKE
'%-totals-%'`; `market=1x2` excludes those rows. This reuses an established
pattern rather than requiring a schema migration or backfill.

## Response shape

Extends the existing `{ data: ... }` envelope every other route uses, adding
a `pagination` object:

```json
{
  "data": [
    {
      "signalId": "sig_abc123",
      "event": "settled",
      "matchId": "fixture_456",
      "side": "home",
      "signalType": "SHARP_MOVE",
      "severity": "HIGH",
      "resultStatus": "correct",
      "momentumScore": 82,
      "oddsChangePct": 19.64,
      "archivedAt": "2026-07-08T14:32:10.000Z",
      "signalData": { "...": "full AgentSignal snapshot at archive time" }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalCount": 143,
    "totalPages": 6
  }
}
```

Column names are converted from the table's `snake_case` to `camelCase` in
the response, matching every other endpoint's `AgentSignal`-shaped
conventions (`signalData` is already a camelCase object, since it's a shallow
copy of the live `AgentSignal`).

**Default sort:** `archivedAt` descending (newest first) — matches
`GET /api/odds-history`'s existing "reverse to newest-first" behavior, and
gives the natural "what just happened" view of a live-growing archive.

## Implementation location

A new `getArchivedSignals(filters, pagination)` function, exported from the
existing `apps/api/src/services/archive.ts` alongside `archiveSignal` (same
module, opposite direction — read vs write over the same table). Uses
`@supabase/supabase-js`'s `.select('*', { count: 'exact' }).range(from, to)`
for the paginated, counted query. A new `GET /api/archive` route is
registered in `server.ts` next to the other GET routes (near
`/api/odds-history`/`/api/market-maker`).

The market-inference check (`-totals-` substring match) is its own small,
pure, independently-testable function, following this codebase's convention
of small logic modules.

## Fail-open behavior

If Supabase isn't configured (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` unset) or
is unreachable, the endpoint returns `200` with `data: []` and
`pagination.totalCount: 0` — never an error. This matches how
`archiveSignal`/`persistence.ts` already treat an unconfigured Supabase as a
normal, silent no-op state rather than a failure condition.

## Auth & rate limiting

Public GET, no `X-API-Key` required — consistent with every existing GET
route in this API (only the one mutating `POST /api/agent/run-once` endpoint
requires a key). Covered by the existing general rate limiter (1200/min per
IP); no new limiter needed.

## Testing

- Unit tests for `getArchivedSignals`'s filter/pagination/sort logic against
  a mocked Supabase client, following the same mocking pattern
  `archive.test.ts` already uses for `archiveSignal`.
- Unit tests for the market-inference function in isolation (both `1x2` and
  `totals` cases, including edge cases like a `matchId` that happens to
  contain `-totals-` as a substring elsewhere — should not currently occur
  given the fixed suffix format, but worth a defensive test).
- Fail-open behavior test: Supabase unconfigured → `200` with empty
  data/zero count, not a thrown error.
- Route-level test (or manual verification against a real configured
  Supabase instance, per this codebase's existing convention of not
  automating tests that require real TxLINE/Supabase credentials) that the
  full query-param-to-response flow works end to end.

## Out of scope (explicitly deferred)

- No dashboard panel / frontend consumer yet (per `PROJECT_STATE.md`'s
  existing "What still needs doing" list — deliberately deferred until real
  data has accumulated for a few days).
- No `match_archive` table or match-level history — only signal-level rows.
- No cursor/keyset pagination — offset/limit is sufficient for a read/inspect
  use case; revisit only if the archive grows large enough for deep-page
  offset queries to become a real performance concern (unlikely before
  July 19).
- Retroactive backtesting against this endpoint's data (task tracked
  separately — this spec only covers making the data queryable).
