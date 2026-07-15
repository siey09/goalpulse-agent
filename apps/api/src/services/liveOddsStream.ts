import type { Request, Response } from "express";
import { getStats, store } from "../store";
import type { OddsSnapshot } from "../types";
import {
  ensureMatchOddsHistory,
  type MatchHistoryResult,
  type MatchHistorySource,
} from "./matchHistory";

interface LiveOddsStreamDependencies {
  ensureMatchOddsHistory(matchId: string): Promise<MatchHistoryResult>;
  setInterval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
  clearInterval(interval: ReturnType<typeof setInterval>): void;
}

const defaultDependencies: LiveOddsStreamDependencies = {
  ensureMatchOddsHistory,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

export function createLiveOddsStreamHandler(
  overrides: Partial<LiveOddsStreamDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async (req: Request, res: Response): Promise<void> => {
    const matchId = String(req.query.matchId ?? "");
    let closed = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    req.on("close", () => {
      closed = true;
      if (interval !== undefined) {
        dependencies.clearInterval(interval);
      }
      if (!res.writableEnded) {
        res.end();
      }
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let historySource: MatchHistorySource = matchId ? "unavailable" : "hot";
    let recoveredHistory: OddsSnapshot[] | undefined;

    if (matchId) {
      try {
        const resolved = await dependencies.ensureMatchOddsHistory(matchId);
        historySource = resolved.source;
        if (resolved.source !== "hot" && resolved.history.length > 0) {
          recoveredHistory = resolved.history;
        }
      } catch (error) {
        console.error(`[history] Failed to prepare live stream for fixture ${matchId}:`, error);
      }
    }

    if (closed) {
      return;
    }

    let lastSignature = "";
    const sendSnapshot = () => {
      if (closed) {
        return;
      }

      const snapshots = recoveredHistory ??
        (matchId
          ? store.oddsSnapshots.filter((snapshot) => snapshot.matchId === matchId)
          : store.oddsSnapshots
        )
          .slice(0, 100)
          .reverse();
      const latestSnapshot = snapshots[snapshots.length - 1];
      const match = matchId
        ? store.matches.find((item) => item.id === matchId) ??
          store.recentFinishedMatches.find((item) => item.id === matchId)
        : store.matches[0];
      const relatedSignals = matchId
        ? store.signals.filter((signal) => signal.matchId === matchId).slice(0, 10)
        : store.signals.slice(0, 10);
      const signature = JSON.stringify({
        latestSnapshotId: latestSnapshot?.id ?? null,
        snapshotCount: snapshots.length,
        matchStatus: match?.status ?? null,
        homeScore: match?.homeScore ?? null,
        awayScore: match?.awayScore ?? null,
        signalCount: relatedSignals.length,
      });

      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;

      res.write(
        `event: odds-update\ndata: ${JSON.stringify({
          matchId,
          timestamp: new Date().toISOString(),
          match,
          latestSnapshot,
          history: snapshots,
          historySource,
          signals: relatedSignals,
          stats: getStats(),
        })}\n\n`
      );
    };

    sendSnapshot();
    if (!closed) {
      interval = dependencies.setInterval(sendSnapshot, 1000);
    }
  };
}
