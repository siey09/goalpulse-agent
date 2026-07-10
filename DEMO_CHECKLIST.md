# GoalPulse Agent Demo Checklist

This doc has two parts:

- **Recommended Live Path** — the actual script to read during a live 4-6
  minute demo. Concrete spoken lines, not just "show panel X."
- **Full Checklist** — every panel/feature built, in on-screen order, for
  Q&A, an extended demo, or as a complete reference. Not all of it fits in
  a single live run — use it to go deeper if judges ask, or to swap in a
  different deep dive than the recommended one.

**Two separate "Verify on Solana" buttons exist in the app** — don't
confuse them mid-demo:
1. **Arena's own button** ("Verify underlying data on Solana ⛓") — proves
   the Arena's tamper-evident settlement hash.
2. **The Outcome Audit Layer's button** ("Verify {match} on Solana ⛓",
   next to the Verification Depth badge) — proves one specific signal's
   underlying TXODDS stat, per-signal, keyed to whichever signal is
   currently selected.

---

## Recommended Live Path (target 4-6 minutes)

Read the **Say:** lines out loud. Bracketed actions are what to click/do.
Each step links back to its full reference section below if you want more
detail or a fallback talking point.

### 1. Opening Problem

**Say:** "Live football odds move fast, but odds movement alone doesn't
tell you *why* the market moved. GoalPulse is an autonomous
TxLINE-powered market intelligence agent — it detects meaningful odds
movement, connects it to live TXODDS Scores context, and explains
whether the move was field-backed or just market noise, in real time,
with zero manual analyst work."

### 2. Open Production App

[Open `https://goalpulse-agent.vercel.app`, hard refresh `Ctrl+Shift+R`]

**Say:** "This is the live, deployed app — not a local demo. Everything
you're about to see is running against real TxLINE data right now."

### 3. Show Backend Health

[Open `https://goalpulse-agent-api.onrender.com/health`]

**Say:** "Quick proof this isn't simulated — service is running,
`useSimulatedFeed` is false, and it's pointed at TxLINE's real API base
URL. This is the actual live feed, not a canned dataset."

*(Full detail: see section 3 below.)*

### 4. Guided Tour Walkthrough — the breadth pass

[Click "Guide", click Next through all 22 steps at a brisk pace —
roughly 3-4 seconds per step]

**Say (before starting):** "Rather than me narrating every panel one by
one, GoalPulse ships its own built-in judge tour. I'll click through it
fast so you can see the full breadth of what's built, then I'll go
deeper on a few pieces."

**Say (while clicking through, don't read every step aloud — narrate the
clusters as they pass):** "Autonomous detection, market board, signal
intelligence, field pressure, the in-play market maker, steam move
detection, the Agent vs Agent Arena, the autonomous replay and proof
chain, the permanent archive and performance analytics — and it closes
on the compliance boundary."

*(Full detail: see section 4 below.)*

### 5. Deep dive — Agent vs Agent Arena

[Scroll/navigate to the Arena panel]

**Say:** "This is Agent vs Agent Arena — three synthetic trading agents
watch the exact same live signal feed and disagree on purpose. Momentum
Follower takes every signal at face value. Contrarian fades signals that
fire without real field support. Kelly Criterion takes the same side as
the signal, but sizes its stake mathematically off the model's own
confidence score instead of a flat bet."

[Point at the three scoreboard cards — net units, ROI, win rate]

**Say:** "You can watch net units, ROI, and win rate update per agent in
real time. And this isn't just a leaderboard — it's tamper-evident."

[Click "Verify underlying data on Solana ⛓"]

**Say:** "That's a real Solana mainnet Merkle-proof check, running right
now, confirming the underlying TxLINE data this settlement is based on
is genuinely anchored on-chain. No funds move, no wagers are placed —
this is analytics only."

*(Full detail: see section 10 below.)*

### 6. Deep dive — Signal detail: Historical Pattern Match + Verification Depth

[Click any signal card to open its detail modal]

**Say:** "Let's click into one signal. Every signal gets a full evidence
trail — what moved, by how much, and why the agent flagged it."

[Scroll to "Similar past signals"]

**Say:** "Here's something new: GoalPulse searches the permanent archive
for past signals of the same type, ranks them by how close they are on
compression and field pressure, and tells you honestly how those
resolved. If there isn't enough precedent yet, it says so plainly — it
never fakes confidence on a small sample."

[Scroll to the Outcome Audit Layer, point at the Verification Depth
badge]

**Say:** "And right here is Verification Depth — deliberately not a
percentage, because there's only one real on-chain claim to check per
signal today, so a fake decimal score would be dishonest. It's a plain
status: not yet verified, or on-chain verified — and 'verified' only
ever means an actual live Solana check just ran, never an assumption."

[Click "Verify {match} on Solana ⛓"]

**Say:** "That's happening live — a real mainnet RPC call, right now, for
this exact signal."

*(Full detail: see section 11 below.)*

### 7. Deep dive — Signal Correlation

[Scroll/navigate to the Signal Correlation panel]

**Say:** "One more: Signal Correlation looks across every match in the
tournament at once, not just one match at a time — it's asking 'did the
same kind of signal fire on two different real matches close together in
time?' That's a genuinely different question than anything else in the
system asks."

**If genuine clusters are showing:** "This is real cross-match pattern
detection — the same side/severity/market pattern firing on two
distinct matches within a five-minute window."

**If it's empty (honest fallback — use this line, don't skip past it):**
"It's quiet right now, and that's honest too — genuine cross-match
correlation is real but naturally uncommon, especially with the
tournament down to its final matches. The panel says so plainly rather
than manufacturing a result to look busy."

*(Full detail: see section 12 below.)*

### 8. Close — Compliance Boundary

**Say:** "Last thing, and it matters: GoalPulse is analytics-only. It
does not place wagers, custody funds, execute trades, connect to
betting accounts, or facilitate betting execution anywhere in this
system. Everything you just saw is explainable market intelligence, not
a betting product."

*(Full detail: see section 16 below.)*

---

## Full Checklist

Comprehensive reference, in on-screen order. Includes everything in the
Recommended Live Path above plus panels worth covering if there's extra
time or a judge asks about something specific.

### 1. Opening Problem

Explain the problem: live football odds move quickly, but odds movement
alone does not explain why the market moved.

Suggested line: GoalPulse Agent is an autonomous TxLINE-powered market
intelligence tool that detects meaningful odds movement, connects it
with live TXODDS Scores context, and explains whether the move was
field-backed or market-only.

### 2. Open Production App

Open: `https://goalpulse-agent.vercel.app`

Hard refresh before demo: `Ctrl + Shift + R`

Show that the app is live and connected to the deployed Render API.

### 3. Show Backend Health

Open: `https://goalpulse-agent-api.onrender.com/health`

Point out:
- service is running
- agent interval
- `useSimulatedFeed` is false
- TxLINE base URL

### 4. Guided Tour Walkthrough

Click "Guide" (bottom-right). Walks through all 22 steps in order:

1. Autonomous intelligence overview
2. Odds movement timeline
3. TxLINE market board
4. Scores intelligence signals
5. Final score audit
6. Field pressure context
7. In-Play Market Maker
8. Steam move detection
9. Agent vs Agent Arena
10. Meta-agent & Skeptic Check
11. Autonomous agent timeline
12. Real TxLINE replay
13. Evidence chain
14. Signal review council
15. Proof hash
16. Signal detail: precedent & verification
17. Transparent thresholds
18. Full tournament archive
19. Signal performance
20. Confidence calibration
21. Signal correlation
22. Compliance boundary

Suggested line: This tour was built to let a judge see the full system
in one guided pass without needing me to narrate every panel.

### 5. Market Board

Show the Market Board.

Point out:
- normalized home, draw, and away odds
- precise TXODDS match status
- match clock labels
- live/upcoming/finished filtering

Suggested line: Instead of generic live or finished labels, GoalPulse
maps TXODDS status ids into judge-readable match states like 1st Half,
Half Time, Finished, or Coverage Suspended.

### 6. Odds Movement Chart

Show the odds chart.

Point out:
- odds movement over time
- **severity-coded signal markers** — HIGH severity markers are larger
  and rose-colored, MEDIUM amber, LOW slate — color and size both encode
  severity now, not just which side moved
- hovering a marker shows a rich tooltip: confidence score, field
  pressure, and the same reasoning text shown in the Signal Intelligence
  Panel (no duplicated logic — it's the same evidence, surfaced on the
  chart)
- signal markers persist even as new odds ticks arrive — a marked point
  is never silently dropped from the visible window, only the
  non-signal points get thinned for readability

Suggested line: The system compares current and previous odds snapshots
and only surfaces signals when movement crosses transparent thresholds
— and now the chart itself shows at a glance how severe each flagged
move was and why, without needing to click into it.

### 7. Signal Intelligence Panel

Show the Signal Intelligence Panel.

Point out:
- severity
- momentum score
- movement percentage
- field-backed or market-only label
- explanation
- TXODDS field context

Suggested line: GoalPulse does not just say odds moved. It explains what
happened near the movement, such as goal, shot, VAR, penalty, card,
danger possession, or high-danger possession.

### 8. Field Pressure Index

Show field context and pressure information.

Point out:
- NONE
- SAFE
- ATTACK
- DANGER
- HIGH_DANGER

Suggested line: Odds movement near high-danger possession, VAR, penalty,
red card, or goal receives stronger evidence than movement with no field
context.

### 9. Reliability Filter

Show reliability status if available.

Explain that GoalPulse reduces confidence when TXODDS data is marked
unreliable, suspended, amended, or discarded.

Suggested line: The agent does not blindly trust every update. It
surfaces reliability warnings as part of the signal evidence.

### 10. Agent vs Agent Arena

Eyebrow: "Agent vs Agent Arena." Heading: "Momentum Follower vs
Contrarian vs Kelly Criterion."

Point out:
- three agents on the same live signal feed, three genuinely different
  strategies (not just three copies of the same bet):
  - **Momentum Follower** takes every signal at face value
  - **Contrarian** fades signals that fire without real field support —
    a live, causal check made at signal-creation time, never the final
    result
  - **Kelly Criterion** takes the same side as the signal, but sizes its
    stake off the confidence score instead of a flat bet
- per-agent scoreboard: net units, ROI, win rate, settled/open counts, a
  "Leading" badge on the current top agent
- per-position rows: match → target, result (correct/incorrect/pending),
  units
- "Tamper-evident settlement" section: a SHA-256 hash of all three
  agents' full position ledgers, plus "Verify underlying data on Solana
  ⛓" — a real on-chain Merkle proof check ("PROOF VALID"/"PROOF
  INVALID")

Suggested line: Settlement is tamper-evident and on-chain-verified — no
funds move, no wagers are placed. This proves the underlying data these
three agents are racing on is real, not just that the scoreboard math is
consistent.

### 11. Signal Detail: Historical Pattern Match + Verification Depth

Click any signal card to open its detail modal.

Point out (Historical Pattern Match — "Historical precedent" /
"Similar past signals" section, near the bottom of the modal):
- searches the permanent archive for settled signals of the same type,
  ranked by closeness on odds compression and field pressure
- excludes the signal's own match and caps other matches to 2
  contributions each, so one repeatedly-firing match can't dominate the
  precedent list
- shows "{X} of {Y} similar past signals resolved correct ({Z}%)" plus
  match/compression/field-pressure/outcome rows
- honest small-sample fallback: "Not enough similar past signals yet."
  below 3 results — never a weak match dressed up as confident

Point out (Verification Depth — badge above the "Verify {match} on
Solana ⛓" button, in the Outcome Audit Layer card):
- a plain status label, deliberately not a percentage — "Not yet
  verified" / "Checking on-chain..." / "On-chain verified" /
  "Verification FAILED" / "Verification unavailable"
- "verified" only ever means a real Solana `.view()` RPC call just ran
  and returned a match — never inferred from the data source alone
- switching to a different signal correctly resets the badge — it never
  shows a stale result from a signal you looked at earlier

Suggested line: This is the same honesty pattern as everywhere else in
GoalPulse — if the evidence isn't there yet, it says so plainly instead
of implying trust it hasn't earned.

### 12. Signal Correlation

Eyebrow: "Cross-match analysis." Heading: "Signal correlation." Badge:
"Pattern matched."

Point out:
- looks for the *same* pattern (side/severity/market) firing across 2+
  distinct real matches within a 5-minute window — the only feature in
  the app reasoning across multiple matches at once
- per-cluster: side · severity · market tag, "{N} real matches", "{N}
  signals over {duration}", real match-id chips
- client-side dedup on totals-market matchIds so one real match's
  several totals lines never inflate the "real matches" count

Suggested line (empty state): "No cross-match signal patterns detected
yet" is a real, expected state — genuine cross-match correlation is
uncommon, especially as the tournament narrows, and the panel says so
rather than manufacturing a result.

### 13. Additional Panels

Cover these if time allows or a judge asks — each is fully built and
live, just not in the primary live-demo path.

**In-Play Market Maker** — eyebrow "In-Play Market Maker," heading "Live
bid/ask quotes." Quotes a bid/ask spread around TxLINE's own de-margined
fair odds; spread width (NARROW/MODERATE/WIDE) widens with field
pressure and reliability problems, narrows in calm conditions. Shows
Bid/Fair/Ask per market, Field Pressure Score (X/45), Reliability.

**Full Tournament Archive** — eyebrow "Permanent history," heading "Full
tournament archive," badge "{N} archived." Insert-only, permanent record
of every signal (and every finished match, even ones with zero signals)
— immune to the in-memory store's caps and TxLINE's own live-rotation
window. Filterable by match ID, status, market, event.

**Signal Performance** — eyebrow "Track record," heading "Signal
performance," badge "Historical accuracy." Per-signal-type accuracy
(color-coded), shown honestly even when a type's accuracy is low — this
project does not cherry-pick its own track record.

**Confidence Calibration** — eyebrow "Calibration check," heading
"Confidence calibration," badge "Score vs. accuracy." Buckets settled
signals by confidence score (0-25/25-50/50-75/75-100) and shows whether
higher confidence actually predicts higher accuracy.

**Steam Move Detection** — eyebrow "Live market scan," heading "Steam
move detection." Detects a trailing run of 3+ consecutive same-direction
odds ticks within 5 minutes — a different signal from the core engine,
which only ever compares two snapshots. Empty state ("No steam move
happening right now — scanning every 5s") is common and expected, not a
bug.

### 14. Results Settlement Audit

Show the Results Settlement Panel.

Point out:
- confirmed or rejected signal
- final score
- winner
- scores endpoint
- scoreline
- reliability
- H1 goals
- H2 goals
- total goals
- corners
- red cards
- yellow cards
- bookmaker
- message id

Suggested line: After the match is finished, GoalPulse audits whether
the signal was confirmed or rejected using final score and score
breakdown evidence.

### 15. Replay Mode

Show replay/audit section if available.

Explain: Replay mode makes the demo repeatable even when live match
activity is quiet. It runs stored TxLINE snapshots through the same
signal engine.

### 16. Compliance Boundary

End with safety/compliance:

GoalPulse is analytics-only. It does not place wagers, custody funds,
execute trades, connect to betting accounts, or facilitate betting
execution.

---

## Final Demo Order

**Recommended live path (4-6 min):**

1. Opening Problem
2. Production app + API health
3. Guided Tour (all 22 steps, fast pass)
4. Agent vs Agent Arena (deep dive)
5. Signal detail: Historical Pattern Match + Verification Depth (deep
   dive)
6. Signal Correlation (deep dive)
7. Compliance statement

**Extended/full walkthrough (if there's more time, or for Q&A):** every
numbered section in the Full Checklist above, in order.

## Quick Verification Before Presenting

Run locally or verify production:

- Frontend loads
- API health returns 200
- Market Board displays matches
- Signal panel displays field context
- Odds chart shows severity-colored markers with confidence/field
  pressure in the hover tooltip
- Guided Tour opens and all 22 steps navigate without console errors
- Arena scoreboard loads all three agents (Momentum Follower, Contrarian,
  Kelly Criterion) with non-empty position data
- Arena's "Verify underlying data on Solana ⛓" returns a result
  (PROOF VALID/INVALID), not stuck loading
- Clicking a signal opens its detail modal; "Similar past signals"
  renders either real results or the honest "Not enough similar past
  signals yet." message
- Verification Depth badge renders correctly and updates after clicking
  "Verify ... on Solana ⛓" for the currently-selected signal
- Signal Correlation loads (real clusters or the honest empty-state
  message, not an error)
- Results Settlement shows audit rows
- Score breakdown rows are visible
- No localhost URL is used in production frontend
