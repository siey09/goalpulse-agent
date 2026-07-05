import { config } from "../config";
import { getGuestJwt } from "./txlineClient";

/**
 * Live connectivity state for TxLINE's native Server-Sent Events stream
 * (/api/scores/stream). This is additive to, and independent from, the
 * existing 5-second polling loop in agent.ts. The polling loop remains the
 * source of truth for signal generation (it is tested and verified live).
 *
 * This monitor proves genuine push-based, real-time connectivity to TxLINE's
 * own streaming infrastructure (rather than just periodic REST polling) and
 * surfaces it honestly via /health as connectivity/observability data:
 * connected status, last-event age, and a running event count. It does not
 * feed directly into signal generation, since the exact per-message JSON
 * shape of the live stream has not been verified against production traffic.
 */
interface LiveStreamState {
  connected: boolean;
  lastEventAt: string | null;
  totalEventsReceived: number;
  totalReconnects: number;
  lastError: string | null;
}

const state: LiveStreamState = {
  connected: false,
  lastEventAt: null,
  totalEventsReceived: 0,
  totalReconnects: 0,
  lastError: null,
};

export function getLiveStreamState(): LiveStreamState {
  return { ...state };
}

function parseSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

async function connectOnce(): Promise<void> {
  const jwt = await getGuestJwt();

  const response = await fetch(`${config.txlineApiBaseUrl}/api/scores/stream`, {
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

/**
 * Starts the live stream monitor with automatic reconnection and capped
 * backoff. Safe to call once at server startup. Never throws; all errors are
 * captured into `state.lastError` so a connectivity issue cannot crash the
 * main API process.
 */
export function startLiveStreamMonitor(): void {
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
