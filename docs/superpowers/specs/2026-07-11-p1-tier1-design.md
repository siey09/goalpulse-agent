# P1 Tier 1: CI, Dependency Pinning, CORS Allowlist, LICENSE

**Date:** 2026-07-11
**Status:** Approved

## Problem

The external technical review's P1 list, sequenced by the user into 3
risk/speed tiers (not PDF order) given ~8 days left before July 19. Tier
1 is "fast, safe, no code-logic risk" — the user's instruction: batch
these together, implement, report back for review, then move to Tier 2
only after explicit approval.

Two of the six original Tier 1 items (P1-13, P1-14) were investigated
and found to need no change — see the "External P0 technical review"
and "RESUME POINT" entries in `PROJECT_STATE.md` for the full verdict
and evidence trail. This spec covers only the four remaining items that
require actual changes.

## P1-9: GitHub Actions CI

New file, `.github/workflows/ci.yml`. Two parallel jobs, each scoped to
its app's actual available scripts (confirmed by reading both
`package.json` files, not assumed):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: apps/api/package-lock.json
      - run: npm ci
      - run: npm run test
      - run: npm run build

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

`apps/api` has no `lint` script; `apps/web` has no `test` script (no
frontend test runner exists in this project, confirmed repeatedly this
session) — the workflow only runs what each app genuinely has, not a
placeholder or a forced addition of a script that doesn't exist.
Node 24 matches the current dev environment (confirmed via `node
--version`) — no `.nvmrc`/`engines` field exists to defer to instead.

## P1-10: Pin dependency versions

`apps/web/package.json` already has zero `"latest"` entries — nothing
to change there. `apps/api/package.json` has 15. Exact currently-
installed versions (pulled directly from each package's own
`node_modules/<pkg>/package.json`, not guessed):

| Package | Current spec | New spec |
|---|---|---|
| `@supabase/supabase-js` | `latest` | `^2.110.0` |
| `cors` | `latest` | `^2.8.6` |
| `dotenv` | `latest` | `^17.4.2` |
| `express` | `latest` | `^5.2.1` |
| `express-rate-limit` | `latest` | `^8.5.2` |
| `swagger-ui-express` | `latest` | `^5.0.1` |
| `yamljs` | `latest` | `^0.3.0` |
| `zod` | `latest` | `^4.4.3` |
| `@types/cors` (dev) | `latest` | `^2.8.19` |
| `@types/express` (dev) | `latest` | `^5.0.6` |
| `@types/node` (dev) | `latest` | `^26.0.1` |
| `@types/swagger-ui-express` (dev) | `latest` | `^4.1.8` |
| `@types/yamljs` (dev) | `latest` | `^0.2.34` |
| `tsx` (dev) | `latest` | `^4.22.4` |
| `typescript` (dev) | `latest` | `^6.0.3` |

Caret ranges chosen to match the file's existing convention (every
other dependency, e.g. `"axios": "^1.18.1"`, already uses `^`) — this
locks out `"latest"`'s complete unpredictability on every fresh
`npm install` while still allowing patch/minor updates, consistent with
the rest of the file. `vitest` (already `^4.1.10`) is untouched.

No version actually changes on disk — `npm install` after this edit
should be a no-op against the current `node_modules`/lockfile, since
every pinned version matches what's already installed.

## P1-11: Restrict CORS

`apps/api/src/server.ts` currently has `app.use(cors());` — no origin
restriction at all. New allowlist:

```typescript
const ALLOWED_CORS_ORIGINS = [
  "https://goalpulse-agent.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(cors({ origin: ALLOWED_CORS_ORIGINS }));
```

This only affects browser JS reading cross-origin `fetch`/`XHR`
responses — direct navigation (a judge opening `/health` or `/api/docs`
in a browser tab) is a top-level navigation, never CORS-checked, and is
completely unaffected either way. `/api/docs` (Swagger UI) is served by
the API itself, same-origin, also unaffected.

No env-var-driven override is added — the two real origins (production
Vercel URL, local Vite dev server) are the only ones this project
actually uses; a hardcoded allowlist is simpler and lower-risk than
introducing new configuration surface area for a single-deployment
hackathon project this close to the deadline.

## P1-12: Add LICENSE file

New file, `LICENSE`, at the repo root. Standard MIT license text.
**User-confirmed:** copyright line reads "GoalPulse Agent contributors",
year 2026.

## Testing

**Backend:** `npm run test && npm run build` from `apps/api` must stay
green after the dependency-pin and CORS changes (pure config/dependency-
spec changes, no logic change expected to affect any existing test).

**Frontend:** `npm run build` from `apps/web` (no changes to this app in
Tier 1 at all — `package.json` already fully pinned).

**CI workflow itself:** cannot be verified by running `npm run
test`/`build` locally (it's YAML, not application code) — verified by
YAML syntax correctness and by matching each job's steps exactly to
scripts confirmed to exist in the corresponding `package.json`. Real
end-to-end verification happens automatically the moment this is pushed
to `main` (the workflow's own `on: push: branches: [main]` trigger) —
the user can check the Actions tab on GitHub after push to confirm it
actually runs and passes.

## Out of scope (explicitly deferred)

- P1-13, P1-14 — confirmed already accurate, no changes (see
  `PROJECT_STATE.md`'s RESUME POINT entry for full evidence).
- Everything in Tier 2 and Tier 3 — explicitly sequenced after Tier 1 is
  reviewed and approved by the user, not touched in this phase.
- The 20 mandatory tests and 15-item Definition of Done checklist —
  explicitly sequenced after all three tiers complete.
