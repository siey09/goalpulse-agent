# GoalPulse Agent Submission Notes

## Project Name

GoalPulse Agent

## Track

TxLINE Trading Tools and Agents

## Public Repository

https://github.com/siey09/goalpulse-agent

## Deployed Application

https://goalpulse-agent.vercel.app

## Backend API

https://goalpulse-agent-api.onrender.com

## Health Check

https://goalpulse-agent-api.onrender.com/health

## One-Sentence Summary

GoalPulse Agent is an autonomous TxLINE-powered odds movement and match momentum detector that monitors live match data, generates explainable market signals, and tracks signal accuracy after match completion.

## Technical Summary

GoalPulse Agent uses a Node.js and Express backend with a scheduled autonomous agent loop. The agent ingests TxLINE-style match and odds data, normalizes it into internal Match and OddsSnapshot schemas, compares current and previous odds snapshots, generates deterministic signals based on odds compression thresholds, and evaluates pending signals once matches finish.

The React dashboard displays live matches, odds movement charts, generated signals, agent run status, and strategy accuracy.

## TxLINE Usage

The current deployed version runs in simulated TxLINE mode so judges can see the full autonomous workflow even when no live World Cup match is active.

The backend includes a real TxLINE adapter at apps/api/src/services/txlineClient.ts. It is designed for bearer-token authenticated TxLINE API requests and can replace the simulated adapter without changing the signal engine or dashboard.

## Endpoints

GET /health
GET /api/matches
GET /api/signals
GET /api/stats
GET /api/agent-runs
GET /api/odds-history?matchId=wc-usa-bra
POST /api/agent/run-once

## Safety Note

GoalPulse Agent is an analytics and monitoring tool only. It does not place wagers, custody funds, execute trades, or facilitate illegal betting activity.

## Demo Video Flow

1. Introduce the problem.
2. Show the deployed dashboard.
3. Show the backend API health endpoint.
4. Show autonomous agent logs or API stats.
5. Show live match and odds movement.
6. Show generated signals with explanations.
7. Show signal evaluation and accuracy tracking.
8. Explain the TxLINE adapter and demo mode.

## Feedback on TxLINE API

The normalized sports data concept is useful because it lets the app focus on signal logic instead of competition-specific data parsing. The main friction during the prototype was preparing a reliable demo path for periods when no live match activity is available, which is why the project includes a simulated TxLINE-style adapter and a real adapter boundary.
