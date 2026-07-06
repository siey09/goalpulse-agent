# API Key Authentication for Mutating Endpoints

Date: 2026-07-07
Status: Approved, ready for implementation planning

## Problem

GoalPulse Agent's backend (`apps/api`, deployed on Render's free tier) exposes
`POST /api/agent/run-once`, a manual trigger that forces an out-of-cycle agent run
(fetching TxLINE data, generating signals, sending Discord alerts for HIGH severity
signals). It currently has no access control — anyone who discovers the public Render
URL can call it, causing unwanted TxLINE API calls, Discord alert spam, or general
resource abuse against a free-tier service with no other protection.

This is the first of several planned "production readiness" features, all constrained
to free tiers with no credit card required.

## Goals

- `POST /api/agent/run-once` requires a valid API key to execute.
- All GET endpoints (consumed by the public, unauthenticated judge-facing dashboard)
  remain exactly as-is — no frontend changes, no new headers on any `fetch()` call in
  `apps/web`.
- Fail-closed: if the key is not configured on the server, the endpoint always
  rejects rather than silently allowing access.

## Non-goals

- Protecting GET endpoints. Confirmed during design: Vite bundles any frontend env var
  into the public JS at build time, so a key sent from the browser would be visible in
  plain text to anyone via devtools/view-source — providing no real confidentiality,
  only friction, and breaking the demo for judges (a browser can't be made to attach a
  custom header to a dashboard's own fetch calls). GETs stay public.
- Rate limiting, IP allowlisting, or any other access-control mechanism beyond a single
  shared key check.
- Protecting any endpoint other than `POST /api/agent/run-once` — confirmed via
  repo-wide search that this is the only mutating endpoint that exists today.

## Confirmed: no existing caller needs updating

Searched the full repository, not just the frontend:
- `apps/web/src` — zero references to `run-once`.
- `TECHNICAL_DOCS.md`, `README.md`, `SUBMISSION_NOTES.md` — each lists the endpoint
  once in a plain API reference table; none actually call it.
- No `.github/workflows` directory exists.
- `render.yaml`'s `healthCheckPath` is `/health` (a GET), not this endpoint.

Nothing in the codebase, docs-as-code, or deploy config currently calls
`POST /api/agent/run-once`. It is a manual/dev-only trigger; only the user will ever
need to send the new header, via curl or similar.

## Design

### Config

Add one field to the existing `config` object in `apps/api/src/config.ts`, matching
the exact pattern already used for `txlineApiKey`:

```ts
apiAccessKey: process.env.API_ACCESS_KEY ?? "",
```

Document `API_ACCESS_KEY=` in `.env.example` with a comment noting it protects
`POST /api/agent/run-once`.

### Middleware

New file `apps/api/src/middleware/apiKeyAuth.ts`, exporting one Express middleware
function, `requireApiKey(req, res, next)`:

- If `config.apiAccessKey` is empty (not configured on the server) → respond
  `401 { error: "API key not configured on the server." }`. This is a fail-closed
  default — chosen explicitly over this codebase's existing fail-open pattern for
  optional integrations (Discord alerts, on-chain validation), because this is a
  security control, not an optional bonus feature. Forgetting to set the env var on
  Render must not silently leave the endpoint open.
- If the incoming `X-API-Key` request header does not exactly match
  `config.apiAccessKey` → respond `401 { error: "Invalid or missing API key." }`.
- Otherwise → call `next()`.

Header choice: `X-API-Key`, not `Authorization: Bearer`, to avoid visual confusion
with the `Authorization: Bearer <jwt>` header this codebase already uses for TxLINE's
own guest JWT elsewhere (`onchainValidation.ts`).

### Route wiring

In `apps/api/src/server.ts`, exactly one line changes:

```ts
app.post("/api/agent/run-once", requireApiKey, async (req, res) => { ... });
```

Every GET route is untouched.

### Error handling

Reuses the existing `res.status(N).json({ error: "..." })` shape already used
elsewhere in `server.ts` (e.g. the on-chain validate-stat route's 400 responses) —
no new error-response convention introduced.

### Testing

No existing test currently covers `server.ts` routes or middleware (the 17 existing
Vitest tests cover `signalEngine.ts`/`store.ts` only). Since `requireApiKey` is a
small pure function `(req, res, next) => void`, add
`apps/api/src/middleware/apiKeyAuth.test.ts` with 3 cases:

1. `config.apiAccessKey` empty → responds 401, `next()` not called.
2. Header missing or wrong → responds 401, `next()` not called.
3. Header matches → `next()` called, no response sent by the middleware itself.

This is genuinely new logic (not just a display change), so it extends the existing
testing precedent rather than being scope creep.

## Alternatives considered (rejected)

**Approach A — inline check in the route handler**, no separate middleware file.
Rejected: mixes an auth concern into route logic; any future protected endpoint would
require copy-pasting the same check instead of reusing it.

**Approach C — global middleware (`app.use`) with an exclusion list for public GETs.**
Rejected: disproportionate to the actual requirement (one endpoint). A mistake in the
GET exclusion list could accidentally lock judges out of the live dashboard — a much
worse failure mode than the single-endpoint abuse risk this feature protects against.

## Follow-ups (not in scope for this task)

- Additional "production readiness" features are planned as separate, subsequent
  design/implementation passes, all constrained to free tiers with no credit card.
