# Rate Limiting for GoalPulse Agent's Backend API

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

GoalPulse Agent's backend (`apps/api`, Render free tier) has no rate limiting on any
endpoint. `POST /api/agent/run-once` is already protected by an API key
(`docs/superpowers/specs/2026-07-07-api-key-auth-design.md`), but a leaked key or a
scripting mistake could still hammer it at unlimited frequency. The 12 GET endpoints,
consumed by the public, unauthenticated judge-facing dashboard, have no protection
against accidental or malicious traffic spikes either.

This is the second "production readiness" feature, using `express-rate-limit`
(free, open source, standard for Express), constrained to free tiers with no credit
card required.

## Goals

- `POST /api/agent/run-once` gets a strict rate limit as defense-in-depth alongside
  its existing API key check.
- All GET endpoints get a generous rate limit that will not interfere with normal
  judge/demo dashboard usage under any realistic scenario.
- `req.ip` correctly reflects the real visitor IP behind Render's reverse proxy, not
  Render's internal proxy IP (see "Prerequisite fix" below) — otherwise the limiter
  would either treat all visitors as one client, or be trivially bypassable.

## Traffic baseline (measured, not estimated)

Traced every polling interval in `apps/web` for a single open dashboard tab, steady
state: `App.tsx`'s main loop (5s interval × 7 parallel GETs = 84/min) +
`WhatChangedPanel.tsx` (5s × 3 = 36/min) + `SignalIntelligencePanel.tsx` (30s × 3 =
6/min) + `ResultsSettlementPanel.tsx` (30s × 3 = 6/min) = **~132 GET requests/minute
per open tab**. The SSE connections (`/api/live/odds-stream`,
`/api/live/replay-stream`) are long-lived; once open they don't re-request
repeatedly, so they count once against the limiter at connection time, not per
pushed event — no special-casing needed.

## Approved numeric thresholds

- **GET endpoints (general limiter): 1200 requests/minute per IP** (~9x the
  single-tab baseline). Chosen deliberately generous: for a hackathon demo, the cost
  of accidentally rate-limiting a judge during live evaluation is far worse than the
  cost of being slightly less strict against abuse. This is a small demo app, not a
  high-value attack target.
- **`POST /api/agent/run-once` (strict limiter): 10 requests/minute per IP.** This
  endpoint is never called by the dashboard (confirmed during the API-key-auth
  design), so this number has zero judge-facing risk either way — it exists purely
  as defense-in-depth alongside the API key, generous enough for the user's own
  manual/curl testing.

## Prerequisite fix: `trust proxy`, in two phases

Render sits behind a reverse proxy (traffic passes through Cloudflare and Render's
own load balancer per Render's community documentation), so without configuring
Express's `trust proxy` setting, `req.ip` — what `express-rate-limit` keys on by
default — would return Render's internal proxy IP for every visitor, collapsing all
judges/visitors into one rate-limit bucket.

**This value could not be verified with confidence from official documentation.**
Research during design found no official Render doc guaranteeing an exact hop count.
A Render community source states traffic passes through both Cloudflare and Render's
load balancer (suggesting possibly 2 hops), and — more importantly — confirms
*"the Render reverse proxy does not filter out any incoming X-Forwarded-For headers,
it just appends the proxy IP to that list."* This is exactly the precondition
Express's own docs warn makes an imprecise `trust proxy` value spoofable (a client
could inject fake entries into `X-Forwarded-For` that never get stripped). Given
this, the design proceeds in two phases rather than guessing:

**Phase 1 (this implementation pass):**
- Set `app.set("trust proxy", 1)` in `server.ts` as a working interim value,
  documented in a code comment as unverified pending empirical confirmation.
- Add a temporary diagnostic middleware, applied to all routes before any other
  middleware, that logs the raw `X-Forwarded-For` header and
  `req.socket.remoteAddress` for every incoming request:

  ```ts
  // TEMPORARY: remove once the real Render hop count is confirmed via these logs.
  app.use((req, res, next) => {
    console.log(
      `[trust-proxy-diagnostic] x-forwarded-for="${req.headers["x-forwarded-for"] ?? ""}" socket-remote-address="${req.socket.remoteAddress}"`
    );
    next();
  });
  ```
- This is safe to ship now because the general limiter (1200/min) is generous enough
  that even imperfect IP-bucketing during this diagnostic period is very unlikely to
  affect anyone.

**Phase 2 (explicit follow-up, NOT part of this implementation pass):** once the user
checks Render's log dashboard after real traffic and counts the actual number of
comma-separated entries in the logged `X-Forwarded-For` header, `trust proxy` gets
updated to the confirmed correct number and the diagnostic middleware is removed.
This is tracked as a follow-up, not built now.

## Design

### Dependency

Add `express-rate-limit` to `apps/api/package.json`, using `"latest"` to match the
existing convention for every other dependency in that file.

### Limiter configuration

New file `apps/api/src/middleware/rateLimiters.ts` (plural, matching the existing
`middleware/apiKeyAuth.ts` convention), exporting two configured instances:

- `generalApiLimiter` — 1200 requests/minute per IP, JSON error body on rejection.
- `runOnceLimiter` — 10 requests/minute per IP, JSON error body on rejection.

Both reuse the existing `{ error: "..." }` response shape already used elsewhere in
`server.ts`.

### Route wiring

`app.use(generalApiLimiter)` added once, right after the existing
`app.use(cors())`/`app.use(express.json())` lines — covers all 12 GET routes
automatically, no per-route changes. `POST /api/agent/run-once` gets
`runOnceLimiter` stacked in front of the existing `requireApiKey`:

```ts
app.post("/api/agent/run-once", runOnceLimiter, requireApiKey, async (req, res) => { ... });
```

That route is protected by both the strict 10/min limit and the general 1200/min
limit; the strict one binds first in practice.

### Testing

Different from the API-key feature: no automated unit test for the rate limiter
thresholds themselves. `requireApiKey` was a pure function, trivial to unit test with
fixed inputs. Rate limiting is inherently time-window-based and counts requests in an
internal store — meaningfully testing the exact 1200/10 thresholds would require
mocking timers or firing hundreds of real requests, which is slow and fragile across
`express-rate-limit` version bumps. Instead: manual verification via a curl loop that
fires past the `runOnceLimiter` threshold (11+ requests within one minute) and
confirms the 12th+ returns 429, documented as an explicit step in the implementation
plan.

## Alternatives considered (rejected)

**Per-route-group limiters applied individually** to each of the 12 `app.get(...)`
calls instead of one blanket `app.use()`. Rejected: more granular control that isn't
needed right now since every GET route shares the same limit; would touch 12 route
definitions for no current benefit.

**One shared limiter for everything, no separate stricter tier for POST.** Rejected:
doesn't deliver the explicitly requested "extra protection alongside the API key" —
a leaked key could still be hit up to 1200 times/min under this approach.

## Follow-ups (not in scope for this task)

- **Phase 2 of the `trust proxy` fix** (see above): update to the confirmed real hop
  count and remove the temporary diagnostic logging, once the user reports back from
  Render's logs.
- Further "production readiness" features are planned as separate, subsequent
  design/implementation passes, all constrained to free tiers with no credit card.
