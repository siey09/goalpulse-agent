# Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generous 1200/min general rate limit to all GET endpoints and a strict 10/min limit to `POST /api/agent/run-once`, plus an interim `trust proxy` fix with temporary diagnostic logging to empirically confirm Render's real reverse-proxy hop count.

**Architecture:** Two `express-rate-limit` instances in a new `apps/api/src/middleware/rateLimiters.ts`, applied in `server.ts`: one globally via `app.use()`, one stacked onto the single POST route in front of the existing `requireApiKey` middleware.

**Tech Stack:** Node.js, Express, TypeScript, `express-rate-limit` v8 (confirmed current published version via `npm view express-rate-limit version` during planning).

## Global Constraints

- General GET limiter: **1200 requests/minute per IP** (spec: "Approved numeric thresholds").
- `POST /api/agent/run-once` limiter: **10 requests/minute per IP** (spec: "Approved numeric thresholds").
- `express-rate-limit` v8's option for the request cap is named `limit`, not `max` (confirmed against the current package during planning — the older `max` option name from v6/v7 is not used here).
- `express-rate-limit` is imported as a named export: `import { rateLimit } from "express-rate-limit"` (not a default export).
- Both limiters return the existing `{ error: "..." }` JSON shape on rejection (spec: "Limiter configuration").
- `app.set("trust proxy", 1)` is an explicitly interim value, documented as unverified pending empirical confirmation — do NOT treat this as final (spec: "Prerequisite fix", Phase 1/Phase 2).
- The temporary diagnostic logging middleware and updating `trust proxy` to the real confirmed value are two different things: the logging ships now; updating the value is an explicit follow-up NOT part of this plan (spec: "Follow-ups").
- No automated unit test for the rate limiter thresholds — time-window-based, not a pure function (spec: "Testing"). Verification is manual curl-loop testing instead.
- Do not touch `apps/api/src/middleware/apiKeyAuth.ts` or its test file — `requireApiKey` stays exactly as-is, only stacked with the new `runOnceLimiter` in front of it in `server.ts`.

---

### Task 1: Add the dependency and create the rate limiter configurations

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/middleware/rateLimiters.ts`

**Interfaces:**
- Produces: `export const generalApiLimiter` and `export const runOnceLimiter`, both Express middleware (`(req, res, next) => void`, the return type of `rateLimit(...)`). Task 2 imports both into `server.ts`.

- [ ] **Step 1: Add the dependency**

In `apps/api/package.json`, the current `dependencies` block is:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "tweetnacl": "^1.0.3",
    "zod": "latest"
  },
```

Add `express-rate-limit` alphabetically, matching the existing `"latest"` convention used for `cors`, `dotenv`, and `express`:

```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/spl-token": "^0.4.14",
    "@solana/web3.js": "^1.98.4",
    "axios": "^1.18.1",
    "bs58": "^6.0.0",
    "cors": "latest",
    "dotenv": "latest",
    "express": "latest",
    "express-rate-limit": "latest",
    "tweetnacl": "^1.0.3",
    "zod": "latest"
  },
```

- [ ] **Step 2: Install it**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd install`
Expected: completes successfully, `node_modules/express-rate-limit` now exists, `package-lock.json` is updated.

- [ ] **Step 3: Create the rate limiter configurations**

Create `apps/api/src/middleware/rateLimiters.ts`:

```ts
import { rateLimit } from "express-rate-limit";

/**
 * Generous general-purpose limit applied to every route. A single open
 * dashboard tab generates ~132 GET requests/minute in steady state (measured
 * across App.tsx and its polling panels); 1200/min leaves wide headroom for
 * multiple judges/devices sharing an IP while still blocking blatant abuse.
 * Deliberately generous: for a hackathon demo, accidentally rate-limiting a
 * judge during live evaluation is far worse than being slightly less strict
 * against abuse.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

/**
 * Strict limit for POST /api/agent/run-once, stacked in front of its existing
 * API key check as defense-in-depth. This endpoint is never called by the
 * live dashboard, so this number has zero judge-facing risk either way.
 */
export const runOnceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { error: "Too many requests to this endpoint. Please wait before trying again." },
});
```

- [ ] **Step 4: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output (clean `tsc` run).

- [ ] **Step 5: Verify existing tests still pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 20 existing tests pass (this task doesn't add new tests; `rateLimiters.ts` isn't imported anywhere yet).

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/middleware/rateLimiters.ts
git commit -m "Add express-rate-limit and configure generalApiLimiter/runOnceLimiter"
```

---

### Task 2: Wire trust proxy, diagnostic logging, and both limiters into server.ts

**Files:**
- Modify: `apps/api/src/server.ts:1-16` (imports and app setup)
- Modify: `apps/api/src/server.ts` (the `POST /api/agent/run-once` route registration)

**Interfaces:**
- Consumes: `generalApiLimiter`, `runOnceLimiter` from `./middleware/rateLimiters` (Task 1).

- [ ] **Step 1: Add the import**

In `apps/api/src/server.ts`, the current imports are:

```ts
import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

Add one import line after the `apiKeyAuth` import:

```ts
import { createHash } from "crypto";
import cors from "cors";
import express from "express";
import { processAgentCycle } from "./agent";
import { fetchRecentTxLineResults } from "./services/txlineClient";
import { getLiveStreamState, startLiveStreamMonitor } from "./services/txlineStream";
import { validateStatOnChain } from "./services/onchainValidation";
import { buildSignalFromSnapshots } from "./logic/signalEngine";
import { config } from "./config";
import { requireApiKey } from "./middleware/apiKeyAuth";
import { generalApiLimiter, runOnceLimiter } from "./middleware/rateLimiters";
import { getPnlSummary, getStats, store , upsertRecentFinishedMatches } from "./store";
import type { OddsSnapshot } from "./types";
```

- [ ] **Step 2: Add trust proxy, diagnostic logging, and the general limiter**

Find the current app setup:

```ts
const app = express();

app.use(cors());
app.use(express.json());
```

Replace with:

```ts
const app = express();

// Interim value — Render's exact reverse-proxy hop count could not be
// verified from official documentation (see docs/superpowers/specs/
// 2026-07-07-rate-limiting-design.md, "Prerequisite fix"). Confirm the real
// value from the diagnostic logging below before treating this as final.
app.set("trust proxy", 1);

// TEMPORARY: remove once the real Render hop count is confirmed via these
// logs (see the spec's Phase 2 follow-up). Logs the raw incoming header so
// the actual number of proxy hops can be counted from Render's own logs.
app.use((req, res, next) => {
  console.log(
    `[trust-proxy-diagnostic] x-forwarded-for="${req.headers["x-forwarded-for"] ?? ""}" socket-remote-address="${req.socket.remoteAddress}"`
  );
  next();
});

app.use(cors());
app.use(express.json());
app.use(generalApiLimiter);
```

- [ ] **Step 3: Add the strict limiter to the run-once route**

Find the current route registration:

```ts
app.post("/api/agent/run-once", requireApiKey, async (_req, res) => {
```

Replace with:

```ts
app.post("/api/agent/run-once", runOnceLimiter, requireApiKey, async (_req, res) => {
```

- [ ] **Step 4: Verify the project builds**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run build`
Expected: completes with no output.

- [ ] **Step 5: Verify existing tests still pass**

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run test`
Expected: PASS — all 20 existing tests pass.

- [ ] **Step 6: Manually verify the general GET limiter doesn't interfere with normal use**

Start the server locally (ensure `.env.local` has `API_ACCESS_KEY` set from the prior feature, e.g. `API_ACCESS_KEY=test-key-123`):

Run: `cd C:\Projects\goalpulse-agent\apps\api && npm.cmd run dev`

In a second terminal:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/matches`
Expected: `200` — a single normal request is unaffected.

- [ ] **Step 7: Manually verify the strict run-once limiter rejects excess requests with 429**

With the dev server still running, fire 11 requests in a tight loop (the 11th exceeds the 10/min limit):

Run:
```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "request $i: %{http_code}\n" -X POST -H "X-API-Key: test-key-123" http://localhost:4000/api/agent/run-once
done
```
Expected: requests 1–10 print `200`, request 11 prints `429`.

- [ ] **Step 8: Confirm the 429 response body matches the configured message**

Run: `curl -s -X POST -H "X-API-Key: test-key-123" http://localhost:4000/api/agent/run-once`
Expected (immediately after Step 7, still within the same minute window):
```json
{"error":"Too many requests to this endpoint. Please wait before trying again."}
```

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "Wire trust proxy, diagnostic logging, and rate limiters into server.ts"
```

---

## Self-Review

**Spec coverage:**
- Traffic-baseline-informed 1200/min general limit and 10/min run-once limit (spec: "Approved numeric thresholds") → Task 1.
- `trust proxy` Phase 1 interim value + temporary diagnostic logging (spec: "Prerequisite fix") → Task 2, Step 2.
- Phase 2 (finalizing the real value, removing the diagnostic logging) explicitly NOT included — confirmed absent from both tasks, tracked only as a spec follow-up.
- `express-rate-limit` dependency (spec: "Dependency") → Task 1.
- `generalApiLimiter`/`runOnceLimiter` configuration and existing `{ error: "..." }` shape (spec: "Limiter configuration") → Task 1.
- Route wiring, general limiter global + strict limiter stacked on run-once (spec: "Route wiring") → Task 2.
- No automated unit test, manual curl verification instead (spec: "Testing") → Task 2, Steps 6–8.
- Alternatives explicitly rejected (per-route-group limiters, single shared limiter) → not present anywhere in either task.

**Placeholder scan:** No TBD/TODO markers; all code blocks are complete, copied from either the actual current file contents (verified by reading them during planning) or fully written new content, using the verified real `express-rate-limit` v8 API (`rateLimit` named import, `limit` option).

**Type consistency:** `generalApiLimiter`/`runOnceLimiter` (Task 1) are used identically in Task 2 — imported by name, used directly as Express middleware with no wrapper, matching how `requireApiKey` is already used in the same file.
