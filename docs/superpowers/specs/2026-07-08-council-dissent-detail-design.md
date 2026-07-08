# Outcome Audit Layer — Dissenting-Vote Detail Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan

## Problem

`GET /api/replay/backtest`'s 3-agent council (Movement Detector, Mean
Reversion Guard, Evidence Correlator) already computes and returns a full
per-signal `votes` array (agent name, vote, reason) inside `councilVotes[]`
for every signal — this data is not missing from the backend response.
What's actually missing is any queryable notion of *disagreement itself*:
whether a signal's decision was unanimous or contested is buried inside each
signal's raw vote array, with no per-signal flag and no aggregate metric
anywhere for how often the three agents actually disagree across an audit
run. This task makes disagreement itself a first-class, queryable data
point, not just an internal tiebreak that happens to be reconstructable by
reading three vote objects per signal.

**Explicitly out of scope (per user decision during brainstorming):**
frontend changes. `apps/web/src/App.tsx`'s "Signal review council" panel
currently only ever renders `councilVotes[0]` (the first signal), which is a
separate, pre-existing frontend gap — not addressed here. This spec is
backend-only: enriching the API response so the data exists and is
queryable, ahead of any future frontend work.

## Definition of dissent

Only Agent A (Movement Detector) can literally vote `"reject"`; Agent B
(Mean Reversion Guard) and Agent C (Evidence Correlator) only ever vote
`"approve"` or `"watch"` (see `server.ts`'s existing vote-construction logic
in the `/api/replay/backtest` route). A true, symmetric 3-way unanimous "no"
is therefore impossible in this schema — the only symmetric consensus state
is all three agents voting `"approve"`.

Given this, **dissent is defined per signal as: any agent whose vote is not
`"approve"`.** `unanimous` is true only when `approvals === 3` (all three
approved). This is a deterministic, no-new-judgment-calls definition that
directly surfaces why a signal fell short of full consensus, rather than
only flagging the narrower "watch" (1-approval) case and hiding that a
2-of-3 "approved" signal still had one skeptical agent.

## Response shape changes

### Per-signal: `councilVotes[]` entries gain two fields

```json
{
  "signalId": "signal-42",
  "matchId": "match-7",
  "target": "Brazil",
  "decision": "approved",
  "approvals": 2,
  "totalAgents": 3,
  "votes": [
    { "agent": "Agent A - Movement Detector", "vote": "approve", "reason": "..." },
    { "agent": "Agent B - Mean Reversion Guard", "vote": "watch", "reason": "..." },
    { "agent": "Agent C - Evidence Correlator", "vote": "approve", "reason": "..." }
  ],
  "unanimous": false,
  "dissentingAgents": ["Agent B - Mean Reversion Guard"]
}
```

`votes` itself is unchanged — `dissentingAgents` is a derived summary of the
same data, not a replacement for it. A consumer wanting the *why* still
reads `votes[].reason`; a consumer wanting to filter/count dissent reads
`dissentingAgents`/`unanimous` directly without re-deriving it from `votes`.

### Aggregate: new `summary.councilDissent` object

```json
"summary": {
  "snapshotsProcessed": 87,
  "signalsDetected": 40,
  "correctSignals": 22,
  "incorrectSignals": 10,
  "accuracyPct": 69,
  "smartMoneyTraps": 5,
  "confirmedTraps": 3,
  "possibleTraps": 2,
  "councilDissent": {
    "unanimousSignals": 28,
    "dissentingSignals": 12,
    "dissentRatePct": 30,
    "dissentByAgent": {
      "Agent A - Movement Detector": 2,
      "Agent B - Mean Reversion Guard": 9,
      "Agent C - Evidence Correlator": 3
    }
  }
}
```

`dissentByAgent` is built generically from whichever agent names actually
appear across the run's votes (not hardcoded to the three current agent
names), and includes every agent at `0` if they never dissented — so the
map is always a complete picture of all three agents, never silently
omitting one that happened to agree on every signal.

`dissentRatePct` is `Math.round((dissentingSignals / totalSignals) * 100)`,
`0` when there are no signals (avoiding a divide-by-zero), matching this
codebase's existing pattern for `accuracyPct` in the same `summary` object.

## Implementation

A new pure module, `apps/api/src/logic/councilDissent.ts`, following this
session's established convention of extracting new logic into small,
independently-testable `logic/` modules (matching `arena.ts`,
`marketMaker.ts`, `paginationParams.ts` — none of which require any I/O or
mocking to test):

```typescript
export interface CouncilVoteEntry {
  agent: string;
  vote: "approve" | "reject" | "watch";
  reason: string;
}

export interface DissentInfo {
  unanimous: boolean;
  dissentingAgents: string[];
}

export function computeDissent(votes: CouncilVoteEntry[]): DissentInfo {
  const dissentingAgents = votes
    .filter((vote) => vote.vote !== "approve")
    .map((vote) => vote.agent);

  return { unanimous: dissentingAgents.length === 0, dissentingAgents };
}

export interface DissentSummary {
  unanimousSignals: number;
  dissentingSignals: number;
  dissentRatePct: number;
  dissentByAgent: Record<string, number>;
}

export function summarizeDissent(
  perSignalVotes: CouncilVoteEntry[][]
): DissentSummary {
  const dissentByAgent: Record<string, number> = {};

  for (const votes of perSignalVotes) {
    for (const vote of votes) {
      dissentByAgent[vote.agent] = dissentByAgent[vote.agent] ?? 0;
    }
  }

  let unanimousSignals = 0;

  for (const votes of perSignalVotes) {
    const { unanimous, dissentingAgents } = computeDissent(votes);
    if (unanimous) unanimousSignals += 1;
    for (const agent of dissentingAgents) {
      dissentByAgent[agent] += 1;
    }
  }

  const dissentingSignals = perSignalVotes.length - unanimousSignals;
  const dissentRatePct =
    perSignalVotes.length > 0
      ? Math.round((dissentingSignals / perSignalVotes.length) * 100)
      : 0;

  return { unanimousSignals, dissentingSignals, dissentRatePct, dissentByAgent };
}
```

`server.ts`'s existing `/api/replay/backtest` route calls `computeDissent`
once per signal when building each `councilVotes[]` entry, and calls
`summarizeDissent` once (passing every signal's `votes` array) to build
`summary.councilDissent`. No other route logic changes — the existing
`votes`/`decision`/`approvals`/`totalAgents` construction is untouched.

## Tamper-evidence (proof hash)

The existing SHA-256 proof hash's `councilVotes` mapping (currently
`{ signalId, decision, approvals, totalAgents }` per signal, deliberately
excluding the full `votes` array with reasons) gains `unanimous` and
`dissentingAgents`, so the new derived fields are covered by the same
tamper-evident hash as every other summary-level fact about the audit run.
The full `votes` array (with free-text `reason` strings) stays excluded
from the hash input, matching the existing precedent — this is a
deliberate, pre-existing choice this spec does not change.

## Docs

`openapi.yaml`'s existing `/api/replay/backtest` response schema is updated
to document `unanimous`/`dissentingAgents` on each `councilVotes[]` item and
the new `summary.councilDissent` object.

## Testing

Unit tests for `computeDissent` and `summarizeDissent` against plain vote
objects (no mocking, no I/O) — covering: all-approve (unanimous),
one-dissent (2/3 approved), the "watch" case (1/3 approved), the
zero-signals edge case (`dissentRatePct: 0`, empty `dissentByAgent`), and
that an agent who never dissents across any signal still appears in
`dissentByAgent` at `0`. No route-level test needed, matching this
codebase's existing convention (pure logic gets unit tests; route wiring is
thin and untested, consistent with every other route in `server.ts`).

## Out of scope (explicitly deferred)

- Frontend changes to `App.tsx`'s council panel (see "Problem" above —
  separate, pre-existing gap, not addressed here).
- Any change to the underlying vote-casting logic itself (thresholds for
  `movementApproved`/`reversionApproved`/`eventApproved`) — this spec only
  adds a derived summary of votes that are already cast, it does not change
  who votes what or why.
- A dedicated `/api/replay/backtest/dissent` or similar sub-endpoint — the
  existing single response is enriched in place, no new route.
