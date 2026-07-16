# GoalPulse Web Dashboard

React, TypeScript, Vite, and Tailwind frontend for the GoalPulse autonomous sports-market intelligence system.

## Live App

- Frontend: https://goalpulse-agent.vercel.app
- Backend API: https://goalpulse-agent-api.onrender.com
- Community: https://discord.gg/vCsA8Wuwh

## Dashboard Destinations

The bare URL opens the nine-destination Command Center:

- Operations: Command Center, Live Markets, Signals
- Strategy: Agent Arena, Market Maker, Replay Lab
- Trust: Verification, Archive, System Health

The earlier single-scroll composition remains available at `?preview=classic` for reference. Both layouts consume the same top-level data and shared panel components.

## Ask GoalPulse

Ask GoalPulse is deterministic and uses no external LLM:

- `/features` browses the complete 15-feature catalog.
- `/features <name>` opens one feature's workflow, formulas/rules, evidence, and honest limit.
- `/help` shows command guidance.
- Natural-language questions continue to use current GoalPulse signals and existing backend endpoints.

Feature commands are parsed locally before live-data intents, so exploring the knowledge catalog adds no model or API usage. The catalog is the canonical source for feature-level explanations; do not duplicate its full contents in another UI or document.

## Important Files

- `src/App.tsx` — shared data orchestration, natural-language analyst intents, and local-first command routing
- `src/app/AppShell.tsx` — persistent Command Center navigation and header
- `src/features/` — one page module per Command Center destination
- `src/lib/goalPulseFeatureCatalog.ts` — typed 15-feature catalog and slash-command parser
- `src/lib/goalPulseFeatureCatalog.test.ts` — catalog and parser tests
- `src/components/AnalystChatWidget.tsx` — structured feature index/detail/help renderer
- `src/components/AnalystChatWidget.test.tsx` — chat interaction and accessibility regression tests
- `src/components/signals/SignalAuditDrawer.tsx` — selected-signal evidence and verification workspace
- `src/styles/tokens.css` and `src/components/ui/` — shared visual tokens and primitives

## Local Development

From the repository root:

```powershell
npm.cmd install
$env:VITE_API_BASE_URL="http://localhost:4000"
npm.cmd --prefix apps/web run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Open `http://127.0.0.1:5175`.

The production frontend must use `https://goalpulse-agent-api.onrender.com`, never a localhost API URL.

## Verification

From the repository root:

```powershell
npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
```

## Compliance Boundary

GoalPulse is for sports analytics and market intelligence only. It does not place wagers, recommend bets, custody funds, execute trades, connect to betting accounts, or facilitate betting.
