# GoalPulse Agent Technical Documentation

## Overview

GoalPulse Agent is an autonomous sports odds movement and match momentum detector for the TxLINE Trading Tools and Agents track.

The system ingests live or simulated TxLINE-style match data, normalizes match and odds snapshots, runs deterministic signal logic, logs autonomous decisions, and evaluates signal outcomes after matches finish.

## Core Architecture

GoalPulse has three main layers:

1. Feed ingestion layer
2. Autonomous agent and signal engine
3. Live dashboard and API layer

## Feed Ingestion

The backend currently supports two feed modes:

- Simulated TxLINE mode for demo reliability
- Real TxLINE adapter mode for production integration

The feed mode is controlled with:

USE_SIMULATED_FEED=true

When set to false, the agent uses the TxLINE client adapter and reads API credentials from environment variables.

## Environment Variables

PORT=4000
AGENT_INTERVAL_MS=5000
USE_SIMULATED_FEED=true
TXLINE_API_BASE_URL=https://txline.txodds.com
TXLINE_API_KEY=

## Agent Strategy

The agent compares the current odds snapshot against the previous odds snapshot for each match.

Signal thresholds:

- HIGH sharp movement: odds compression >= 15%
- MEDIUM momentum shift: odds compression >= 8%
- LOW watch signal: odds compression >= 4%
- NO ACTION: movement below 4%

Momentum score combines:

- odds movement
- match time pressure
- score change impact

## Autonomous Operation

The backend automatically runs the agent cycle on a fixed interval. In demo mode, the interval is 5 seconds. In production mode, this can be set to 60 seconds or another appropriate interval.

Each agent cycle:

1. Fetches feed data
2. Updates match state
3. Creates odds snapshots
4. Compares current odds against previous odds
5. Generates signals when thresholds are met
6. Evaluates pending signals when matches finish
7. Updates accuracy statistics

## API Endpoints

GET /health
Returns API health, feed mode, and agent interval.

GET /api/matches
Returns normalized live match objects.

GET /api/signals
Returns autonomous agent signals.

GET /api/stats
Returns processed update count, generated signals, pending signals, correct signals, incorrect signals, closed signals, and strategy accuracy.

GET /api/agent-runs
Returns historical agent cycle logs.

GET /api/odds-history?matchId=wc-usa-bra
Returns odds snapshots for a selected match.

POST /api/agent/run-once
Manually triggers one agent cycle for testing.

## TxLINE Integration Notes

The current prototype uses a simulated TxLINE-style feed so judges can test and view the complete product flow even when no real match is live.

The real TxLINE adapter is located at:

apps/api/src/services/txlineClient.ts

The adapter uses bearer token authentication via:

Authorization: Bearer TXLINE_API_KEY

After receiving the official TxLINE World Cup endpoint response, only the adapter mapper needs to be updated. The signal engine, API routes, and dashboard can remain unchanged because the internal Match and OddsSnapshot schema is already normalized.

## Safety and Compliance

GoalPulse Agent is an analytics and monitoring tool. It does not place wagers, custody funds, execute trades, or perform financial transactions.

## Demo Script Summary

1. Show the dashboard.
2. Show that the API is healthy.
3. Show the autonomous backend logs running every interval.
4. Show live match updates and odds movement.
5. Show agent-generated signals.
6. Show finished matches triggering signal evaluation.
7. Show accuracy stats on the dashboard.
