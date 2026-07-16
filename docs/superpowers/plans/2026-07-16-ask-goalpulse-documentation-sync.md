# Ask GoalPulse Documentation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the public, technical, web-package, and demo documentation with the deployed deterministic Ask GoalPulse feature guide.

**Architecture:** Keep the typed frontend catalog as the canonical feature-level source. Markdown documents explain the user flow, architecture, and judge demo at the appropriate level without duplicating all 15 entries or creating an imaginary API contract.

**Tech Stack:** Markdown, TypeScript source inspection, ripgrep, Vitest, Git

## Global Constraints

- Update only `README.md`, `TECHNICAL_DOCS.md`, `DEMO_CHECKLIST.md`, and `apps/web/README.md` plus this spec/plan.
- Do not change `openapi.yaml`; Ask GoalPulse slash commands are frontend-only.
- State that `/features` commands use no LLM call and resolve locally before existing live-data intents.
- Keep Solana proof validation distinct from the local SHA-256 fingerprint.
- Do not duplicate the complete 15-entry catalog outside `goalPulseFeatureCatalog.ts`.

---

### Task 1: Synchronize public and developer documentation

**Files:**
- Modify: `README.md`
- Modify: `TECHNICAL_DOCS.md`
- Modify: `apps/web/README.md`

**Interfaces:**
- Consumes: `GOALPULSE_FEATURES`, `parseGoalPulseCommand()`, `AnalystReply`, and `AnalystChatWidget` from the deployed frontend.
- Produces: accurate public usage, architectural explanation, portable local commands, and verification instructions.

- [ ] **Step 1: Capture the stale-state evidence**

Run:

```powershell
rg -n "Ask GoalPulse|keyword-matched|C:\\Projects\\goalpulse-agent|/features" README.md TECHNICAL_DOCS.md apps/web/README.md
```

Expected: old string-only/keyword-matched descriptions, no `/features` documentation, and machine-specific web README paths.

- [ ] **Step 2: Update the three documents**

Document these exact commands and boundaries:

```text
/features              browse 15 implemented features
/features <name>       open workflow, formulas/rules, evidence, and limits
/help                  show command guidance
```

Explain that slash commands return typed local replies before `generateAnalystReply()` can call live endpoints; ordinary natural-language questions continue to use existing API data. Add `goalPulseFeatureCatalog.ts`, its parser test, and `AnalystChatWidget.test.tsx` to the technical file list. Replace `C:\Projects\goalpulse-agent` with commands run from the repository root.

- [ ] **Step 3: Validate content and behavior references**

Run:

```powershell
rg -n "/features|goalPulseFeatureCatalog|zero-LLM|no external LLM|npm --prefix apps/web" README.md TECHNICAL_DOCS.md apps/web/README.md
npm.cmd --prefix apps/web test -- goalPulseFeatureCatalog.test.ts AnalystChatWidget.test.tsx
```

Expected: all three documents expose the current flow and all 11 focused tests pass.

### Task 2: Update the judge demo path

**Files:**
- Modify: `DEMO_CHECKLIST.md`

**Interfaces:**
- Consumes: the deployed `/features` interaction documented in Task 1.
- Produces: a concise judge script and pre-demo verification checklist.

- [ ] **Step 1: Add the short Ask GoalPulse judge sequence**

Insert a breadth-to-depth moment after the Guided Tour:

```text
Open Ask GoalPulse → enter /features → select Composite Confidence Score → select Solana Verification.
```

The spoken copy must explain that the catalog is deterministic, source-backed, local, and analytics-only. Update numbering and the Final Demo Order consistently.

- [ ] **Step 2: Add pre-demo checks**

Require `/features` to show four categories and 15 buttons, a selected detail to show workflow/formula/evidence/limit, `/help` to render, and the mobile panel to avoid horizontal overflow.

- [ ] **Step 3: Validate the complete documentation diff**

Run:

```powershell
rg -n "/features|Composite Confidence|Solana Verification" DEMO_CHECKLIST.md
rg -n "C:\\Projects\\goalpulse-agent|keyword-matched against live" README.md TECHNICAL_DOCS.md DEMO_CHECKLIST.md apps/web/README.md
git diff --check
git diff --stat
```

Expected: the new judge path appears, stale phrases return no matches, whitespace checks pass, and only the approved documentation files plus spec/plan are changed.

### Task 3: Publish the documentation sync

**Files:**
- Stage the four updated documents and the spec/plan.

**Interfaces:**
- Produces: one reviewed documentation commit, passing PR, and deployed `main` documentation.

- [ ] **Step 1: Commit intentionally**

```powershell
git add README.md TECHNICAL_DOCS.md DEMO_CHECKLIST.md apps/web/README.md
git add -f docs/superpowers/specs/2026-07-16-ask-goalpulse-documentation-sync-design.md docs/superpowers/plans/2026-07-16-ask-goalpulse-documentation-sync.md
git commit -m "docs: sync Ask GoalPulse feature guide"
```

- [ ] **Step 2: Push and merge through CI**

Push `codex/sync-ask-goalpulse-docs`, create a ready PR targeting `main`, wait for frontend/backend/Vercel checks, and squash-merge only after every required check passes.

- [ ] **Step 3: Confirm deployment state**

Confirm the merge commit receives a successful Vercel status and the GitHub-rendered README contains `/features` and `/features <name>`.
