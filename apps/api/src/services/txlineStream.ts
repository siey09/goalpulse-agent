import { createSseStreamMonitor } from "./sseStreamMonitor";

/**
 * Live connectivity state for TxLINE's native Server-Sent Events stream
 * (/api/scores/stream). This is additive to, and independent from, the
 * existing 5-second polling loop in agent.ts. The polling loop remains the
 * source of truth for signal generation.
 *
 * This monitor proves genuine push-based, real-time connectivity to TxLINE's
 * own streaming infrastructure (rather than just periodic REST polling) and
 * surfaces it honestly via /health as connectivity/observability data:
 * connected status, last-event age, and a running event count. It does not
 * feed directly into signal generation, since the exact per-message JSON
 * shape of the live stream has not been verified against production traffic.
 */
const monitor = createSseStreamMonitor("/api/scores/stream");

export const getLiveStreamState = monitor.getState;

/**
 * Starts the live stream monitor with automatic reconnection and capped
 * backoff. Safe to call once at server startup. Never throws; all errors are
 * captured into state.lastError so a connectivity issue cannot crash the
 * main API process.
 */
export const startLiveStreamMonitor = monitor.start;
