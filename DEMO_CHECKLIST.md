# GoalPulse Agent Demo Checklist

Target demo length: under 5 minutes.

## 1. Opening Problem

Explain that live sports odds and match data move quickly, and manual monitoring can miss important shifts.

Suggested line:
GoalPulse Agent is an autonomous monitoring tool that watches TxLINE-style live match and odds data, detects meaningful odds movement, explains the signal, and tracks whether the signal was correct after the match ends.

## 2. Show Backend Agent

Open backend terminal:

cd apps/api
npm.cmd run dev

Show logs like:

Feed mode: simulated_txline
Processed 3 matches, generated 1 signal(s), and evaluated 0 pending signal(s).

Explain that the agent runs automatically every interval without manual input.

## 3. Show API Health

Open:
http://localhost:4000/health

Show:
- service status
- agent interval
- feed mode

## 4. Show Live Dashboard

Open:
http://localhost:5173

Show:
- TxLINE updates
- signals generated
- strategy accuracy
- live matches
- odds chart
- autonomous signal feed

## 5. Show Signals

Open:
http://localhost:4000/api/signals

Explain:
- signal type
- severity
- odds before and after
- odds movement percentage
- momentum score
- explanation
- result status

## 6. Show Evaluation

Open:
http://localhost:4000/api/stats

Show:
- pending signals
- correct signals
- incorrect signals
- closed signals
- strategy accuracy

Explain that the agent evaluates pending signals after matches finish.

## 7. Explain TxLINE Integration

Show file:
apps/api/src/services/txlineClient.ts

Explain that demo mode uses a simulated TxLINE-style feed for judge reliability, while the TxLINE adapter is ready for bearer-token authenticated API integration.

## 8. Close Strong

Suggested closing line:
GoalPulse turns granular live sports data into an autonomous, explainable monitoring agent for market intelligence teams, analysts, and sports data operators.

## Must Show in Video

- Running backend agent
- Working dashboard
- API endpoints
- Signal generation
- Signal evaluation
- Technical architecture
- Safety note: analytics only, no wagering or fund custody
