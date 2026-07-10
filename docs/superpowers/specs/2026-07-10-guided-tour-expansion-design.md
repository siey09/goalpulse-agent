# Guided Tour Expansion (20 → 22 Steps) Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

The Guided Tour (`judgeDemoSteps` in `App.tsx`) covers 20 steps but
predates the four most recently shipped features: Historical Pattern
Match, Verification Depth Score, Meta-agent recommendation, and Skeptic
Check. None of them are covered anywhere in the tour.

## Two independent step-indexed systems — both must be updated

Confirmed by re-reading the tour's full mechanics before proposing
anything (per the user's explicit instruction, given this exact bug
class already occurred once this session — see `PROJECT_STATE.md`'s
"Guided tour updated with 7 missing panel steps" entry):

1. **The imperative system**: `guideTargets[step]` (`App.tsx`), a
   22-entry array (after this change) of `{ id?, text? }` used by
   `getGuideTargetElement()` to find and spotlight the right DOM node
   per step.
2. **A second, independent React-conditional system**: four elements
   (`guide-backtest-card`, `guide-event-correlation`,
   `guide-oracle-council`, `guide-proof-readiness`) each have their own
   hardcoded `isJudgeMode && judgeStep === N` className conditional,
   redundant with (1) but tracked completely separately.
3. **A numeric retry guard** in `nextGuideStep()`:
   `nextStep >= 8 && nextStep <= 10` — pre-fetches `replayBacktest` data
   ahead of the Replay/Proof-hash steps that need it, re-triggering on
   every step in that range until it succeeds.

All three must be updated in lockstep with any inserted step, or steps
after the insertion point silently spotlight the wrong element (the
exact bug already found and fixed once this session).

## Two new steps

**Step A — "Meta-agent & Skeptic Check," inserted immediately after the
existing "Agent vs Agent Arena" step.** Both features render inside
`ArenaPanel.tsx`, above the scoreboard grid. A dedicated step (not a
text edit to the existing Arena step) matches this tour's own
established convention of giving each shipped feature its own step
rather than cramming multiple claims into one (Archive/Performance/
Confidence Calibration/Correlation each already got separate steps).

**Step B — "Signal detail: precedent & verification," inserted
immediately after the existing "Proof hash" step, before "Transparent
thresholds."** Groups with the existing evidence-chain/signal-review/
proof-hash cluster — all about building trust in a signal's evidence —
rather than sitting apart from it.

## Step B is instructional, not auto-opened — architecture decision

Historical Pattern Match ("Similar past signals") and Verification
Depth Score live inside the `selectedSignal` detail modal, which only
renders once a real signal is clicked — there is no reliable "next
signal" for the tour to programmatically select, and every other step
in this tour only ever scrolls-to-and-highlights *static, always-
rendered* elements via `getElementById`/`findCardByText`. Forcing the
modal open would be the tour's first departure from that architecture
and its most fragile step. Instead, Step B highlights the "Latest
signals" list (reusing the existing `id="agent"` target, same as the
existing step 3) and instructs the judge to click "View details"
themselves, describing what they'll find — matching the manual-action
pattern already used for this exact flow in
`DEMO_CHECKLIST.md`'s Recommended Live Path.

## New step content

```typescript
// Inserted at index 9 (0-indexed), immediately after "Agent vs Agent Arena":
{
  title: "10. Meta-agent & Skeptic Check",
  detail: "The Arena doesn't just race three strategies — it audits its own leaderboard. A Meta-agent recommendation ranks strategies fairly by ROI, not raw units, and only names a leader once there's enough settled data. A Skeptic Check then questions that lead directly: if it's concentrated in one real match, it says so plainly instead of implying more confidence than the data supports.",
}

// Inserted at index 15 (0-indexed, after the Step A insertion has shifted "Proof hash" to index 14):
{
  title: "16. Signal detail: precedent & verification",
  detail: "Click \"View details\" on any signal card to open its full evidence trail yourself. Scroll down and you'll find two more things: \"Similar past signals\" searches the permanent archive for precedent of the same signal type and shows honestly how those resolved, and a Verification Depth badge shows whether that specific signal's underlying data has actually been checked on Solana mainnet — never a percentage, always a plain, honest status.",
}
```

All title numbers from index 9 onward (Step A's insertion point) through
the end renumber by +1 through index 14 ("15. Proof hash"), then by +2
from index 15 onward (both insertions now apply) through the final
"22. Compliance boundary."

## Full renumbered step list (22 steps, 0-indexed)

| Index | Title | Change |
|---|---|---|
| 0 | 1. Autonomous intelligence overview | unchanged |
| 1 | 2. Odds movement timeline | unchanged |
| 2 | 3. TxLINE market board | unchanged |
| 3 | 4. Scores intelligence signals | unchanged |
| 4 | 5. Final score audit | unchanged |
| 5 | 6. Field pressure context | unchanged |
| 6 | 7. In-Play Market Maker | unchanged |
| 7 | 8. Steam move detection | unchanged |
| 8 | 9. Agent vs Agent Arena | unchanged |
| 9 | **10. Meta-agent & Skeptic Check** | **new (Step A)** |
| 10 | 11. Autonomous agent timeline | renumbered (was 10) |
| 11 | 12. Real TxLINE replay | renumbered (was 11) |
| 12 | 13. Evidence chain | renumbered (was 12) |
| 13 | 14. Signal review council | renumbered (was 13) |
| 14 | 15. Proof hash | renumbered (was 14) |
| 15 | **16. Signal detail: precedent & verification** | **new (Step B)** |
| 16 | 17. Transparent thresholds | renumbered (was 15) |
| 17 | 18. Full tournament archive | renumbered (was 16) |
| 18 | 19. Signal performance | renumbered (was 17) |
| 19 | 20. Confidence calibration | renumbered (was 18) |
| 20 | 21. Signal correlation | renumbered (was 19) |
| 21 | 22. Compliance boundary | renumbered (was 20) |

## `guideTargets` changes (mirrors the table above exactly)

- Index 9 (new): `{ id: "guide-meta-skeptic", text: "Meta-agent recommendation" }`
- Index 15 (new): `{ id: "agent", text: "Latest signals" }` (reuses the existing `id="agent"` target — no new DOM element for the modal itself, since it isn't opened by the tour)
- All other entries shift position to match the table above, values otherwise unchanged.

## `ArenaPanel.tsx` change

Wrap the existing Meta-agent recommendation callout and the conditional
Skeptic Check callout in one new container so Step A can spotlight both
together, precisely, instead of re-highlighting the whole Arena card a
second time in a row:

```tsx
<div id="guide-meta-skeptic">
  <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
    {/* existing Meta-agent recommendation content, unchanged */}
  </div>

  {skepticMessage && (
    <div className="mb-4 rounded-2xl border border-rose-400/15 bg-rose-400/5 p-4">
      {/* existing Skeptic Check content, unchanged */}
    </div>
  )}
</div>
```

Purely a wrapping-element addition — no logic change, no new state, no
new props.

## `App.tsx` — other step-indexed structures to update

**Four JSX `judgeStep === N` conditionals** (only Step A's insertion
affects these — Step B is inserted after all four, so none of them need
a second shift):

| Element id | Old literal | New literal |
|---|---|---|
| `guide-backtest-card` | `judgeStep === 10` | `judgeStep === 11` |
| `guide-event-correlation` | `judgeStep === 11` | `judgeStep === 12` |
| `guide-oracle-council` | `judgeStep === 12` | `judgeStep === 13` |
| `guide-proof-readiness` | `judgeStep === 13` | `judgeStep === 14` |

**`nextGuideStep()`'s retry guard**: `nextStep >= 8 && nextStep <= 10`
→ `nextStep >= 8 && nextStep <= 11` (upper bound shifts by the one step
now inserted between the guard's original range; lower bound 8
unchanged since Arena itself, the trigger, doesn't move).

`nextStep === 6` and `nextStep === 7` (Market Maker / Steam Move
triggers, both before the insertion point) are unaffected — confirmed
by inspection, no change.

`judgeDemoSteps.length`, `judgeStep + 1`, and all other references are
already dynamic (not hardcoded literals) and need no changes — confirmed
via a full-file grep for every `judgeStep`/`guideTargets[`/
`judgeDemoSteps[` occurrence before writing this spec, not just the ones
anticipated going in.

## `DEMO_CHECKLIST.md` change

Update the "Guided Tour Walkthrough" section's 20-item numbered list
(both the Full Checklist's section 4 and the Recommended Live Path's
reference to it, if it names a step count) to the new 22-step list from
the table above. Scope is explicitly limited to the tour step list
itself — not a rewrite of the Arena deep-dive section's own bullets
(which also predate Meta-agent/Skeptic and could use their own update,
but that's a separate, not-yet-requested task).

## Testing

No frontend test runner exists in `apps/web`. Verified via clean
`npm run build` and a full manual dev-browser walkthrough: step through
all 22 steps end to end, confirming the correct element is spotlighted
at *every* step — not just the two new ones — since this exact bug
class (stale index after insertion) already happened once this session
and only surfaces by checking previously-correct steps too. Per the
session's process: merge only after user review, then verify live in
production with the same full step-through.

## Out of scope (explicitly deferred)

- No change to `DEMO_CHECKLIST.md`'s Arena deep-dive section bullets or
  Recommended Live Path spoken lines beyond the tour step list itself —
  not requested this round.
- No change to the `nextStep === 6`/`nextStep === 7` triggers — confirmed
  unaffected, not touched.
- No new highlight target elements beyond the one new
  `id="guide-meta-skeptic"` wrapper — Step B intentionally reuses the
  existing `id="agent"` target rather than inventing a new one for
  content that isn't actually rendered until a judge clicks a signal.
