const REPLAY_RETRY_DELAYS_MS = [250, 500, 1000] as const;

export interface ReplayRetryState {
  attempt: number;
  timer?: number;
}

export function createReplayRetryState(): ReplayRetryState {
  return { attempt: 0 };
}

export function replayStreamUrl(
  apiBaseUrl: string,
  matchId: string,
  startCursor: number,
  intervalMs: number
): string {
  const params = new URLSearchParams({
    matchId,
    startCursor: String(startCursor),
    intervalMs: String(intervalMs),
  });
  return `${apiBaseUrl}/api/live/replay-stream?${params.toString()}`;
}

export function scheduleReplayReconnect(input: {
  state: ReplayRetryState;
  getCursor: () => number;
  setTimer: (callback: () => void, delayMs: number) => number;
  onReconnect: (latestCursor: number) => void;
}): boolean {
  if (input.state.timer != null || input.state.attempt >= REPLAY_RETRY_DELAYS_MS.length) {
    return false;
  }

  const delayMs = REPLAY_RETRY_DELAYS_MS[input.state.attempt];
  input.state.attempt += 1;
  input.state.timer = input.setTimer(() => {
    input.state.timer = undefined;
    input.onReconnect(input.getCursor());
  }, delayMs);
  return true;
}

export function cancelReplayReconnect(
  state: ReplayRetryState,
  clearTimer: (timer: number) => void
): void {
  if (state.timer != null) clearTimer(state.timer);
  state.timer = undefined;
}

export function resetReplayRetries(
  state: ReplayRetryState,
  clearTimer: (timer: number) => void
): void {
  cancelReplayReconnect(state, clearTimer);
  state.attempt = 0;
}
