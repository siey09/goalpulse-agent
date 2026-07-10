import { createSseStreamMonitor } from "./sseStreamMonitor";

/**
 * Live connectivity state for TxLINE's native Server-Sent Events stream
 * (/api/odds/stream). This is additive to, and independent from, both the
 * existing scores-stream monitor (txlineStream.ts) and the 5-second odds
 * polling loop in agent.ts, which remains the sole source of odds data
 * fed into signal generation and the odds chart.
 *
 * This monitor proves genuine push-based, real-time connectivity to
 * TxLINE's real-time odds feed and surfaces it honestly via /health as
 * connectivity/observability data: connected status, last-event age, and a
 * running event count. It does not feed into store.oddsSnapshots or signal
 * generation, since the exact per-message JSON shape of this live stream
 * has not been verified against production traffic.
 */
const monitor = createSseStreamMonitor("/api/odds/stream");

export const getLiveOddsStreamState = monitor.getState;

/**
 * Starts the live odds stream monitor with automatic reconnection and
 * capped backoff. Safe to call once at server startup. Never throws; all
 * errors are captured into state.lastError so a connectivity issue cannot
 * crash the main API process.
 */
export const startLiveOddsStreamMonitor = monitor.start;
