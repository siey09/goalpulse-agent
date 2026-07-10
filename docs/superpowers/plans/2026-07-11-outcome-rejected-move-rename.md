# CONFIRMED_TRAP → OUTCOME_REJECTED_MOVE Rename + Arena Proof Note Wording Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `CONFIRMED_TRAP` status value to `OUTCOME_REJECTED_MOVE` across all live code and judge-facing reference docs (never asserting proven manipulation for a signal that simply lost at settlement), fix the two UI spots whose wording independently asserted the same false certainty, and split `arena.proof.note`'s conflated local-hash/on-chain-proof sentence into two honest claims.

**Architecture:** Pure rename + wording edits across 7 files, no logic changes, no new dependencies, no backend schema changes. Backend (`server.ts`) first, then frontend live code (`App.tsx`, `pinnedCaseStudies.ts`), then reference docs (`openapi.yaml`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`).

**Tech Stack:** TypeScript (backend + frontend), Markdown, YAML. No new dependencies.

## Global Constraints

- Only the `CONFIRMED_TRAP` value renames — `POSSIBLE_TRAP`, `WATCHING`, `VALIDATED_MOVE`, `LOW_TRAP_RISK` are untouched.
- `confirmedTraps`/`possibleTraps`/`smartMoneyTraps` JSON field names are untouched (API-contract stability) — only the **displayed word** "confirmed" → "rejected" in two UI spots that show it directly to a reader.
- Historical spec/plan docs and `pinned-case-studies-raw.json` are untouched.
- Verify backend with `npm run test && npm run build` from `apps/api`; verify frontend with `npm run build` from `apps/web` after each code task.

---

### Task 1: Backend — `server.ts` rename + proof note wording

**Files:**
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces: `trapStatus: "OUTCOME_REJECTED_MOVE"` value (was `"CONFIRMED_TRAP"`) — consumed by `apps/web/src/App.tsx` (Task 2) via the existing `AgentSignal.trapStatus` field, already typed as `string` on the frontend (no type change needed there).

- [ ] **Step 1: Rename the `trapStatus` value in `classifyMarketTrap`**

Find (inside `classifyMarketTrap`'s `movement >= 15` branch):

```typescript
    if (movement >= 15) {
      return {
        trapStatus: "CONFIRMED_TRAP",
        trapScore: Math.min(100, Math.round(55 + movement)),
```

Replace with:

```typescript
    if (movement >= 15) {
      return {
        trapStatus: "OUTCOME_REJECTED_MOVE",
        trapScore: Math.min(100, Math.round(55 + movement)),
```

(`trapReason` on this same branch is unchanged — it already hedges with "possible smart money trap or false market move," not asserting certainty.)

- [ ] **Step 2: Update the `confirmedTraps` count's filter predicate**

Find:

```typescript
  const confirmedTraps = detectedSignals.filter(
    (signal) => signal.trapStatus === "CONFIRMED_TRAP"
  ).length;
```

Replace with:

```typescript
  const confirmedTraps = detectedSignals.filter(
    (signal) => signal.trapStatus === "OUTCOME_REJECTED_MOVE"
  ).length;
```

(The variable name `confirmedTraps` stays — it's the JSON field name, an API-contract decision out of scope for this rename.)

- [ ] **Step 3: Split `arena.proof.note`'s conflated sentence**

Find:

```typescript
        note:
          "Tamper-evident SHA-256 hash of all three agents' full position ledgers, plus a real on-chain Merkle proof (via GET /api/onchain/validate-stat) confirming the underlying TxLINE data this tournament is based on is genuinely anchored on Solana mainnet. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution.",
```

Replace with:

```typescript
        note:
          "SHA-256 hash of all three agents' full position ledgers - computed locally, tamper-evident only if compared against another copy, never itself posted to Solana. The separate 'Verify underlying data' check below runs a real Solana mainnet Merkle proof confirming the underlying TxLINE stat is genuinely anchored on-chain - that check covers the source data, not this specific ledger hash. This does not mean funds move or a smart contract executes - GoalPulse is analytics only and does not place wagers, custody funds, execute trades, or facilitate betting execution.",
```

- [ ] **Step 4: Verify no test depends on the old string**

Run from `apps/api`: `npm run test`
Expected: all tests pass (a pre-implementation grep confirmed no test file references `CONFIRMED_TRAP`, so this should be a no-op confirmation, not a fix).

- [ ] **Step 5: Verify build**

Run from `apps/api`: `npm run build`
Expected: succeeds with no errors (pure string literal changes, no type changes).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Rename CONFIRMED_TRAP to OUTCOME_REJECTED_MOVE; split arena proof note wording"
```

---

### Task 2: Frontend — `App.tsx` and `pinnedCaseStudies.ts`

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/data/pinnedCaseStudies.ts`

**Interfaces:**
- Consumes: `trapStatus: "OUTCOME_REJECTED_MOVE"` (Task 1) — both files compare against the new string literal directly (no shared type to update, `trapStatus` is typed as plain `string`/`"CONFIRMED_TRAP"`-narrowed literal locally in each file).

- [ ] **Step 1: Update the two filter predicates**

Find (analyst-chat `topTrap` computation, `App.tsx`):

```typescript
        .filter(
          (signal) =>
            signal.trapStatus === "CONFIRMED_TRAP" ||
            signal.trapStatus === "POSSIBLE_TRAP"
        )
```

Replace with:

```typescript
        .filter(
          (signal) =>
            signal.trapStatus === "OUTCOME_REJECTED_MOVE" ||
            signal.trapStatus === "POSSIBLE_TRAP"
        )
```

Find (Smart Money Trap Detector list, a second occurrence of the same pattern further down the file):

```tsx
                      {(replayBacktest.signals ?? [])
                        .filter(
                          (signal) =>
                            signal.trapStatus === "CONFIRMED_TRAP" ||
                            signal.trapStatus === "POSSIBLE_TRAP"
                        )
```

Replace with:

```tsx
                      {(replayBacktest.signals ?? [])
                        .filter(
                          (signal) =>
                            signal.trapStatus === "OUTCOME_REJECTED_MOVE" ||
                            signal.trapStatus === "POSSIBLE_TRAP"
                        )
```

- [ ] **Step 2: Update the "Agent verdict" headline**

Find:

```tsx
                <h3 className="mt-1 text-lg font-black text-white">
                  {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                  selectedSignal.trapStatus === "CONFIRMED_TRAP"
                    ? "False market move exposed"
                    : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                      ? "Market move validated"
                      : selectedSignal.trapStatus === "POSSIBLE_TRAP"
                        ? "Possible trap under review"
                        : "Market move under review"}
                </h3>
```

Replace with:

```tsx
                <h3 className="mt-1 text-lg font-black text-white">
                  {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                  selectedSignal.trapStatus === "OUTCOME_REJECTED_MOVE"
                    ? "Market move rejected by outcome"
                    : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                      ? "Market move validated"
                      : selectedSignal.trapStatus === "POSSIBLE_TRAP"
                        ? "Possible trap under review"
                        : "Market move under review"}
                </h3>
```

- [ ] **Step 3: Update the "5. Final verdict" text**

Find:

```tsx
                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">5. Final verdict:</span>{" "}
                    {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                    selectedSignal.trapStatus === "CONFIRMED_TRAP"
                      ? "False market move exposed"
                      : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                        ? "Market move validated"
                        : "Market move under review"}
                  </div>
```

Replace with:

```tsx
                  <div className="rounded-xl bg-black/25 p-3">
                    <span className="font-semibold text-white">5. Final verdict:</span>{" "}
                    {selectedSignal.scoreRealityStatus === "REJECTED_BY_SCORE" &&
                    selectedSignal.trapStatus === "OUTCOME_REJECTED_MOVE"
                      ? "Market move rejected by outcome"
                      : selectedSignal.scoreRealityStatus === "CONFIRMED_BY_SCORE"
                        ? "Market move validated"
                        : "Market move under review"}
                  </div>
```

- [ ] **Step 4: Update the Smart Money Trap Detector badge's displayed word**

Find:

```tsx
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-red-100">
                        {(replayBacktest.summary?.confirmedTraps ?? 0)} confirmed •{" "}
                        {(replayBacktest.summary?.possibleTraps ?? 0)} possible
                      </span>
```

Replace with:

```tsx
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-red-100">
                        {(replayBacktest.summary?.confirmedTraps ?? 0)} rejected •{" "}
                        {(replayBacktest.summary?.possibleTraps ?? 0)} possible
                      </span>
```

- [ ] **Step 5: Update the analyst-chat reply's displayed word**

Find:

```typescript
        return `Outcome Audit processed ${summary.signalsDetected ?? 0} signal(s), found ${summary.smartMoneyTraps ?? 0} smart money trap pattern(s), with ${summary.confirmedTraps ?? 0} confirmed and ${summary.possibleTraps ?? 0} possible.`;
```

Replace with:

```typescript
        return `Outcome Audit processed ${summary.signalsDetected ?? 0} signal(s), found ${summary.smartMoneyTraps ?? 0} smart money trap pattern(s), with ${summary.confirmedTraps ?? 0} rejected and ${summary.possibleTraps ?? 0} possible.`;
```

- [ ] **Step 6: Update `pinnedCaseStudies.ts`**

Find:

```typescript
  trapStatus?: "CONFIRMED_TRAP";
```

Replace with:

```typescript
  trapStatus?: "OUTCOME_REJECTED_MOVE";
```

Find (first pinned case study entry):

```typescript
    trapStatus: "CONFIRMED_TRAP",
    trapScore: 100,
    reversalRisk: "EXTREME_REVERSAL",
```

This exact block appears twice (two pinned case studies) — replace **both** occurrences with:

```typescript
    trapStatus: "OUTCOME_REJECTED_MOVE",
    trapScore: 100,
    reversalRisk: "EXTREME_REVERSAL",
```

- [ ] **Step 7: Verify build**

Run from `apps/web`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 8: Manual dev-browser check**

Run `npm run dev` in `apps/web`, open the app. Find a signal with a rejected sharp move (the pinned case studies data — Canada vs Morocco — guarantees this path is exercised; check the "Verified Case Studies" panel or search for "Canada"). Confirm:
- The signal detail modal's "Agent verdict" headline reads "Market move rejected by outcome," not the old text.
- The "5. Final verdict" row shows the same new text.
- The Smart Money Trap Detector badge (in the Outcome Audit section) reads "N rejected • N possible."
- Navigate to the Arena panel, confirm the "Tamper-evident settlement" section shows the new, split wording (local hash vs. separate on-chain check).
- No console errors.

Stop the dev server after checking (exact PID, not pattern-kill).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/data/pinnedCaseStudies.ts
git commit -m "Update frontend CONFIRMED_TRAP references and rejected-move wording"
```

---

### Task 3: Reference docs — `openapi.yaml`, `README.md`, `TECHNICAL_DOCS.md`, `SUBMISSION_NOTES.md`

**Files:**
- Modify: `openapi.yaml`
- Modify: `README.md`
- Modify: `TECHNICAL_DOCS.md`
- Modify: `SUBMISSION_NOTES.md`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 directly (documentation only) — describes the same rename for accuracy.

- [ ] **Step 1: Update `openapi.yaml`**

Find:

```yaml
            trapStatus: { type: string, enum: [WATCHING, VALIDATED_MOVE, CONFIRMED_TRAP, POSSIBLE_TRAP, LOW_TRAP_RISK] }
```

Replace with:

```yaml
            trapStatus: { type: string, enum: [WATCHING, VALIDATED_MOVE, OUTCOME_REJECTED_MOVE, POSSIBLE_TRAP, LOW_TRAP_RISK] }
```

- [ ] **Step 2: Update `README.md`**

Find:

```markdown
- **Canada vs Morocco** (confirmed trap): a 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3), and the Outcome Audit layer correctly classified both as `CONFIRMED_TRAP` with `EXTREME_REVERSAL` risk, backed by a real SHA-256 proof hash.
```

Replace with:

```markdown
- **Canada vs Morocco** (outcome-rejected move): a 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3), and the Outcome Audit layer correctly classified both as `OUTCOME_REJECTED_MOVE` with `EXTREME_REVERSAL` risk, backed by a real SHA-256 proof hash.
```

- [ ] **Step 3: Update `TECHNICAL_DOCS.md`**

Find:

```markdown
- **Smart Money Trap Classification** — signals rejected by the final result are labeled `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating (`EXTREME_REVERSAL`, `MODERATE_REVERSAL`, `NORMAL_WATCH`, or `VALIDATED`). Verified live example: two Canada signals (55.13% and 52.7% odds compression) were both rejected when Canada lost 0-3 to Morocco, and correctly flagged `CONFIRMED_TRAP` with `trapScore: 100` and `EXTREME_REVERSAL`.
```

Replace with:

```markdown
- **Smart Money Trap Classification** — signals rejected by the final result are labeled `OUTCOME_REJECTED_MOVE`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating (`EXTREME_REVERSAL`, `MODERATE_REVERSAL`, `NORMAL_WATCH`, or `VALIDATED`). Verified live example: two Canada signals (55.13% and 52.7% odds compression) were both rejected when Canada lost 0-3 to Morocco, and correctly flagged `OUTCOME_REJECTED_MOVE` with `trapScore: 100` and `EXTREME_REVERSAL`.
```

- [ ] **Step 4: Update `SUBMISSION_NOTES.md`**

Find:

```markdown
- **Smart Money Trap Detection** — signals that were rejected by the final result are classified as `CONFIRMED_TRAP`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating, turning a wrong call into a structured, explainable category instead of a silent miss.
```

Replace with:

```markdown
- **Smart Money Trap Detection** — signals that were rejected by the final result are classified as `OUTCOME_REJECTED_MOVE`, `POSSIBLE_TRAP`, or `LOW_TRAP_RISK` with a reversal-risk rating, turning a wrong call into a structured, explainable category instead of a silent miss.
```

- [ ] **Step 5: Validate `openapi.yaml`**

Run from the repo root: `npx @redocly/cli lint openapi.yaml`
Expected: valid, no new errors (matching the pre-existing baseline of `operationId` warnings only).

- [ ] **Step 6: Commit**

```bash
git add openapi.yaml README.md TECHNICAL_DOCS.md SUBMISSION_NOTES.md
git commit -m "Update reference docs: CONFIRMED_TRAP to OUTCOME_REJECTED_MOVE"
```

---

## Final Verification

- [ ] Run `npm run test && npm run build` from `apps/api` — all green, clean build.
- [ ] Run `npm run build` from `apps/web` — clean build.
- [ ] Run `npx @redocly/cli lint openapi.yaml` from the repo root — valid.
- [ ] `grep -r CONFIRMED_TRAP` across the repo returns only the explicitly-untouched historical spec/plan docs and `pinned-case-studies-raw.json` — confirming nothing live was missed.
- [ ] Manual end-to-end check in the dev browser per Task 2 Step 8.
- [ ] Report the full diff to the user for review — do not push until they explicitly say to.
