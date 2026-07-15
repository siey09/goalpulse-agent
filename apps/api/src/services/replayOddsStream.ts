import type { Request, Response } from "express";
import { getStats, store } from "../store";
import {
  ensureMatchOddsHistory,
  type MatchHistoryResult,
} from "./matchHistory";

interface ReplayOddsStreamDependencies {
  ensureMatchOddsHistory(matchId: string): Promise<MatchHistoryResult>;
  setInterval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
  clearInterval(interval: ReturnType<typeof setInterval>): void;
}

const defaultDependencies: ReplayOddsStreamDependencies = {
  ensureMatchOddsHistory,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

function integerParam(value: unknown, fallback: number): number {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (scalar == null || (typeof scalar === "string" && scalar.trim() === "")) {
    return fallback;
  }
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function parseReplayStreamParams(query: Record<string, unknown>): {
  startCursor: number;
  intervalMs: number;
} {
  return {
    startCursor: Math.max(0, integerParam(query.startCursor, 0)),
    intervalMs: Math.min(
      2000,
      Math.max(500, integerParam(query.intervalMs, 1000))
    ),
  };
}

export function createReplayOddsStreamHandler(
  overrides: Partial<ReplayOddsStreamDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async (req: Request, res: Response): Promise<void> => {
    const matchId = String(req.query.matchId ?? "");
    const { startCursor, intervalMs } = parseReplayStreamParams(req.query);
    let closed = false;
    let ended = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const finish = () => {
      if (ended) return;
      ended = true;
      if (interval !== undefined) {
        dependencies.clearInterval(interval);
        interval = undefined;
      }
      if (!res.writableEnded) {
        res.end();
      }
    };

    req.on("close", () => {
      closed = true;
      finish();
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let resolved: MatchHistoryResult;
    try {
      resolved = await dependencies.ensureMatchOddsHistory(matchId);
    } catch (error) {
      console.error(`[history] Failed to prepare replay stream for fixture ${matchId}:`, error);
      resolved = { history: [], source: "unavailable" };
    }

    if (closed) return;

    const history = resolved.history.filter((snapshot) => snapshot.source === "txline");
    const match = matchId
      ? store.matches.find((item) => item.id === matchId) ??
        store.recentFinishedMatches.find((item) => item.id === matchId)
      : store.matches[0];
    const relatedSignals = matchId
      ? store.signals.filter((signal) => signal.matchId === matchId).slice(0, 10)
      : store.signals.slice(0, 10);
    let visibleCount = history.length === 0
      ? 0
      : Math.min(startCursor + 1, history.length);

    const sendReplayTick = () => {
      if (closed || ended) return;

      const replayHistory = history.slice(0, visibleCount);
      const latestSnapshot = replayHistory[replayHistory.length - 1];
      const timestampedSnapshot = latestSnapshot as
        | (typeof latestSnapshot & { timestamp?: string })
        | undefined;
      const replayComplete = visibleCount >= history.length;

      res.write(
        `event: odds-update\ndata: ${JSON.stringify({
          matchId,
          timestamp: new Date().toISOString(),
          match,
          latestSnapshot: latestSnapshot ?? null,
          history: replayHistory,
          signals: relatedSignals,
          stats: getStats(),
          streamMode: "replay_test",
          historySource: resolved.source,
          replayCursor: visibleCount,
          replayTotal: history.length,
          replayComplete,
          replayOriginalTimestamp:
            timestampedSnapshot?.createdAt ?? timestampedSnapshot?.timestamp ?? null,
          replayIntervalMs: intervalMs,
        })}\n\n`
      );

      if (replayComplete) {
        finish();
        return;
      }

      visibleCount += 1;
    };

    sendReplayTick();
    if (!closed && !ended) {
      interval = dependencies.setInterval(sendReplayTick, intervalMs);
    }
  };
}
