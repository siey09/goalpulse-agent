# GoalPulse Agent Demo Checklist

Target demo length: 3 to 5 minutes.

## 1. Opening Problem

Explain the problem:

Live football odds move quickly, but odds movement alone does not explain why the market moved.

Suggested line:

GoalPulse Agent is an autonomous TxLINE-powered market intelligence tool that detects meaningful odds movement, connects it with live TXODDS Scores context, and explains whether the move was field-backed or market-only.

## 2. Open Production App

Open:

https://goalpulse-agent.vercel.app

Hard refresh before demo:

Ctrl + Shift + R

Show that the app is live and connected to the deployed Render API.

## 3. Show Backend Health

Open:

https://goalpulse-agent-api.onrender.com/health

Point out:

- service is running
- agent interval
- useSimulatedFeed is false
- TxLINE base URL

## 4. Market Board

Show the Market Board.

Point out:

- normalized home, draw, and away odds
- precise TXODDS match status
- match clock labels
- live/upcoming/finished filtering

Suggested line:

Instead of generic live or finished labels, GoalPulse maps TXODDS status ids into judge-readable match states like 1st Half, Half Time, Finished, or Coverage Suspended.

## 5. Odds Movement Chart

Show the odds chart.

Point out:

- odds movement over time
- movement markers
- sharp move thresholds

Suggested line:

The system compares current and previous odds snapshots and only surfaces signals when movement crosses transparent thresholds.

## 6. Signal Intelligence Panel

Show the Signal Intelligence Panel.

Point out:

- severity
- momentum score
- movement percentage
- field-backed or market-only label
- explanation
- TXODDS field context

Suggested line:

GoalPulse does not just say odds moved. It explains what happened near the movement, such as goal, shot, VAR, penalty, card, danger possession, or high-danger possession.

## 7. Field Pressure Index

Show field context and pressure information.

Point out:

- NONE
- SAFE
- ATTACK
- DANGER
- HIGH_DANGER

Suggested line:

Odds movement near high-danger possession, VAR, penalty, red card, or goal receives stronger evidence than movement with no field context.

## 8. Reliability Filter

Show reliability status if available.

Explain that GoalPulse reduces confidence when TXODDS data is marked unreliable, suspended, amended, or discarded.

Suggested line:

The agent does not blindly trust every update. It surfaces reliability warnings as part of the signal evidence.

## 9. Results Settlement Audit

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

Suggested line:

After the match is finished, GoalPulse audits whether the signal was confirmed or rejected using final score and score breakdown evidence.

## 10. Replay Mode

Show replay/audit section if available.

Explain:

Replay mode makes the demo repeatable even when live match activity is quiet. It runs stored TxLINE snapshots through the same signal engine.

## 11. Judge Demo Guide

Open or scroll to the Judge Demo Guide.

Point out:

- autonomous intelligence overview
- scores intelligence signals
- final score audit
- field pressure context
- evidence chain
- compliance boundary

## 12. Compliance Boundary

End with safety/compliance:

GoalPulse is analytics-only. It does not place wagers, custody funds, execute trades, connect to betting accounts, or facilitate betting execution.

## Final Demo Order

1. Production app
2. API health
3. Market Board
4. Odds chart
5. Signal Intelligence Panel
6. Field Pressure Index
7. Results Settlement Audit
8. Replay mode
9. Judge Demo Guide
10. Compliance statement

## Quick Verification Before Presenting

Run locally or verify production:

- Frontend loads
- API health returns 200
- Market Board displays matches
- Signal panel displays field context
- Results Settlement shows audit rows
- Score breakdown rows are visible
- No localhost URL is used in production frontend
