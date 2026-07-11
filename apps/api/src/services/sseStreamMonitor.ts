import { config } from "../config";
import { getGuestJwt } from "./txlineClient";
import { ODDS_STALE_THRESHOLD_MS } from "../logic/feedHealth";

export interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}

export type StreamStatus = "STREAMING" | "STALE" | "RECONNECTING" | "STOPPED";

/**
 * Read-only derived label over LiveStreamState's existing fields - never
 * writes state, never changes connect/reconnect/backoff behavior. Scoped
 * to these two SSE monitors only, deliberately NOT extended to the
 * polling agent loop (no circuit breaker) or unified into a single
 * app-wide state machine - both confirmed as real regression risk to
 * signal generation this close to the tournament ending (see P1-16 spec).
 *
 * isEnabled must be passed in (mirrors the exact condition start() uses
 * to no-op) because state alone can't distinguish "feed disabled" from
 * "enabled but hasn't connected yet" - both look identical
 * (connected: false, totalReconnects: 0).
 *
 * RECONNECTING covers both an active backoff retry and the sub-second
 * window before the very first connection attempt resolves - the
 * underlying monitor has no separate "CONNECTING" state either, and this
 * window is too short to be worth a 5th label.
 *
 * STALE's threshold reuses ODDS_STALE_THRESHOLD_MS from feedHealth.ts
 * (5 minutes) rather than inventing a new one.
 */
export function deriveStreamStatus(
  state: LiveStreamState,
  isEnabled: boolean,
  nowMs: number
): StreamStatus {
  if (!isEnabled) return "STOPPED";
  if (!state.connected) return "RECONNECTING";
  if (!state.lastEventAt) return "STALE";

  const ageMs = nowMs - new Date(state.lastEventAt).getTime();
  return ageMs > ODDS_STALE_THRESHOLD_MS ? "STALE" : "STREAMING";
}

export function parseSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

/**
 * Creates an independent SSE connectivity monitor for a TxLINE stream
 * endpoint (e.g. "/api/scores/stream", "/api/odds/stream"). Each call
 * returns its own private state -- multiple monitors never share or
 * collide on connection state. Purely observational: proves *that* JSON
 * frames arrive (connected status, last-event age, running event count),
 * never inspects or trusts the parsed payload's contents.
 */
export function createSseStreamMonitor(endpointPath: string): {
  getState: () => LiveStreamState;
  connectOnce: () => Promise<void>;
  start: () => void;
} {
  const state: LiveStreamState = {
    connected: false,
    lastEventAt: null,
    totalEventsReceived: 0,
    totalReconnects: 0,
    lastError: null,
  };

  async function connectOnce(): Promise<void> {
    const jwt = await getGuestJwt();

    const response = await fetch(`${config.txlineApiBaseUrl}${endpointPath}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": config.txlineApiKey,
        Accept: "text/event-stream",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `TxLINE stream connection failed: ${response.status} ${response.statusText}`
      );
    }

    state.connected = true;
    state.lastError = null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const data = parseSseData(chunk);

          if (data === null) {
            continue;
          }

          try {
            JSON.parse(data);
            state.totalEventsReceived += 1;
            state.lastEventAt = new Date().toISOString();
          } catch {
            // Non-JSON keepalive/comment frame; ignore safely.
          }
        }
      }
    } finally {
      state.connected = false;
    }
  }

  function start(): void {
    if (config.useSimulatedFeed || !config.txlineApiKey) {
      return;
    }

    let backoffMs = 2000;
    const maxBackoffMs = 60000;

    const loop = async () => {
      try {
        await connectOnce();
        backoffMs = 2000;
      } catch (error) {
        state.connected = false;
        state.lastError = error instanceof Error ? error.message : String(error);
        state.totalReconnects += 1;
      }

      setTimeout(loop, backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    };

    loop();
  }

  return {
    getState: () => ({ ...state }),
    connectOnce,
    start,
  };
}
