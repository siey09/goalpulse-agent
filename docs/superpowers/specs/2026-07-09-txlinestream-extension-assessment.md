# Extending txlineStream.ts for True Real-Time Frontend Push — Effort/Benefit Assessment

**Date:** 2026-07-09
**Status:** Assessment only — no implementation plan follows, no code changes made.
**Related:** `docs/superpowers/specs/2026-07-08-realtime-push-assessment.md` (the
original real-time-push assessment, focused on generalizing
`/api/live/odds-stream`'s poll-diff pattern to more dashboard data). This
document evaluates a different angle raised since then: can the
*already-existing* upstream push connection in `txlineStream.ts` be used
as the actual trigger for backend updates, rather than periodic polling?

## What `txlineStream.ts` already does

It maintains a persistent SSE connection directly to TxLINE's own
`/api/scores/stream` endpoint, with automatic reconnection and capped
exponential backoff (2s → 60s). This is real, proven, stable
infrastructure — it's been running all session as a connectivity monitor,
surfaced via `/health` and a "TxLINE push feed connected (N events)"
dashboard badge (itself reached via the existing 5s `/health` poll, not
push).

**The critical limitation, confirmed by reading the code directly:**
`connectOnce()`'s per-frame handling is exactly this:

```typescript
try {
  JSON.parse(data);
  state.totalEventsReceived += 1;
  state.lastEventAt = new Date().toISOString();
} catch {
  // Non-JSON keepalive/comment frame; ignore safely.
}
```

The parsed result of `JSON.parse(data)` is discarded immediately — it's
never assigned to a variable, never inspected, never stored. The monitor
only proves *that* a JSON frame arrived and counts it; it does not know
or use *what* the frame contains. The module's own top-of-file comment
says this explicitly: "It does not feed directly into signal generation,
since the exact per-message JSON shape of the live stream has not been
verified against production traffic." This was a deliberate, correct
scoping decision when this module was built — proving genuine
push-connectivity as an observability signal is valuable and low-risk on
its own; parsing and trusting the actual payload shape is a separate,
larger commitment that was correctly deferred.

## What's actually missing to make this drive real updates

1. **Reverse-engineer and verify the real message schema.** TxLINE's
   `/api/scores/stream` payload shape has never been captured and
   compared against the same normalization logic
   (`applyScoreSnapshot`/`normalizeFixture`) the polling path already
   trusts. This is nontrivial, unavoidable, first-step work — building on
   an unverified assumption about the shape risks silently corrupting
   `store.matches`/`store.oddsSnapshots` with malformed data, which
   nothing downstream currently guards against for this source.
2. **A second, concurrent path into the same mutable state.** Right now,
   exactly one thing writes to `store.matches`/`store.oddsSnapshots`/
   `store.signals`: the single-threaded 3-5s agent cycle. Every read-derived
   feature this session (steam detection, correlation, backtesting, and
   now pattern-matched correlation) was deliberately built to never touch
   that pipeline, specifically to keep it the one stable, well-tested,
   synchronous system in the codebase. Wiring `txlineStream.ts`'s events
   to also write into that state introduces a second, asynchronously-
   arriving writer — real risk of double-processing the same match update
   (once from the next poll cycle, once from the stream event) or
   racing `buildSignalFromSnapshots`'s `previous`-snapshot comparison
   against a genuinely concurrent write, a class of bug this pipeline has
   never had to handle before.
3. **The frontend still needs the same work as the original assessment.**
   Even with a genuinely event-driven backend trigger, the frontend side
   of this problem is unchanged from the prior assessment: six polling
   loops to rewire to `EventSource`, a consolidated payload design,
   reconnect/resync handling untested at this scale. A better backend
   trigger source doesn't remove any of that frontend effort — it only
   changes *when* the backend has fresh data to push.

## Effort vs. benefit, revisited

The latency case is genuinely stronger than before: a real event-driven
trigger could react to a TxLINE update in near-real-time instead of
waiting up to one 3-5s poll cycle. But the remaining effort is now
*larger*, not smaller, than the original assessment — it requires
touching the actual signal-generation pipeline (Step 2 above), the one
system this entire session has treated as off-limits for every other
feature, on top of all the frontend work the original assessment already
scoped. Schema verification (Step 1) is real, unavoidable groundwork with
no shortcut.

## Recommendation: still no-go before July 19, for a sharper reason than before

The original assessment's three reasons (small user-visible benefit given
the poll cadence, backend-only session scope, and deadline risk) still
apply and are joined by a fourth, more specific one: this would require
deliberately introducing concurrency risk into the one part of the
codebase that has stayed single-threaded and stable all session, based on
a message schema that has never been verified. That's a meaningfully
different risk profile than adding another read-only `GET` endpoint —
every prior feature this session could be reasoned about and tested in
isolation without touching `agent.ts`'s core loop; this one cannot.

**If ever revisited:** the actual next step wouldn't be building the
frontend push infrastructure — it would be capturing and documenting a
real TxLINE `/api/scores/stream` payload against production traffic
first, entirely independent of any frontend work, to determine whether
Step 1 is even a reasonable lift before committing to Step 2's
architectural risk.
