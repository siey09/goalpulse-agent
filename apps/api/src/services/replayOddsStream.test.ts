import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../store";
import type { Match, OddsSnapshot } from "../types";
import {
  createReplayOddsStreamHandler,
  parseReplayStreamParams,
} from "./replayOddsStream";

const match: Match = {
  id: "m1",
  competition: "World Cup",
  homeTeam: "Norway",
  awayTeam: "England",
  homeScore: 1,
  awayScore: 2,
  minute: 90,
  status: "finished",
  lastUpdated: "2026-07-11T23:59:57.382Z",
};

const older: OddsSnapshot = {
  id: "snapshot-1",
  matchId: match.id,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeOdds: 2,
  drawOdds: 3.2,
  awayOdds: 3.8,
  homeScore: 0,
  awayScore: 0,
  minute: 10,
  source: "txline",
  createdAt: "2026-07-11T22:00:00.000Z",
};

const newer: OddsSnapshot = {
  ...older,
  id: "snapshot-2",
  homeOdds: 1.8,
  minute: 20,
  createdAt: "2026-07-11T22:05:00.000Z",
};

function request(query: Record<string, string>) {
  const req = new EventEmitter() as EventEmitter & {
    query: Record<string, string>;
  };
  req.query = query;
  return req;
}

function makeResponse() {
  return {
    writableEnded: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  };
}

function payloads(response: ReturnType<typeof makeResponse>) {
  return response.write.mock.calls.map(([event]) => {
    const data = String(event).split("\ndata: ")[1]?.trim();
    return JSON.parse(data);
  });
}

function capturedSchedule() {
  let callback: (() => void) | undefined;
  return {
    setInterval: vi.fn((next: () => void) => {
      callback = next;
      return 12 as never;
    }),
    clear: vi.fn(),
    tick() {
      callback?.();
    },
  };
}

describe("replay odds stream", () => {
  beforeEach(() => {
    store.matches = [];
    store.recentFinishedMatches = [match];
    store.oddsSnapshots = [];
    store.signals = [];
    store.agentRuns = [];
  });

  it("replays recovered finished history and stops on the final snapshot", async () => {
    const response = makeResponse();
    const schedule = capturedSchedule();
    const handler = createReplayOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockResolvedValue({
        history: [older, newer],
        source: "archive",
      }),
      setInterval: schedule.setInterval,
      clearInterval: schedule.clear,
    });

    await handler(request({ matchId: "m1" }) as never, response as never);
    schedule.tick();

    expect(payloads(response)).toMatchObject([
      { replayCursor: 1, replayTotal: 2, replayComplete: false },
      { replayCursor: 2, replayTotal: 2, replayComplete: true },
    ]);
    expect(payloads(response)[0]).toMatchObject({
      historySource: "archive",
      replayOriginalTimestamp: older.createdAt,
      replayIntervalMs: 1000,
    });
    expect(schedule.clear).toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });

  it("resumes from startCursor without replaying earlier frames", async () => {
    const response = makeResponse();
    const schedule = capturedSchedule();
    const handler = createReplayOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockResolvedValue({
        history: [older, newer],
        source: "archive",
      }),
      setInterval: schedule.setInterval,
      clearInterval: schedule.clear,
    });

    await handler(
      request({ matchId: "m1", startCursor: "1" }) as never,
      response as never
    );

    expect(payloads(response)).toMatchObject([
      { replayCursor: 2, replayTotal: 2, replayComplete: true },
    ]);
    expect(payloads(response)[0].latestSnapshot.id).toBe(newer.id);
    expect(schedule.setInterval).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it("clamps replay parameters to safe integer bounds", () => {
    expect(parseReplayStreamParams({ startCursor: "-9", intervalMs: "100" })).toEqual({
      startCursor: 0,
      intervalMs: 500,
    });
    expect(parseReplayStreamParams({ startCursor: "2.9", intervalMs: "9999" })).toEqual({
      startCursor: 2,
      intervalMs: 2000,
    });
  });

  it("emits one completed event when recovered history is empty", async () => {
    const response = makeResponse();
    const schedule = capturedSchedule();
    const handler = createReplayOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockResolvedValue({
        history: [],
        source: "unavailable",
      }),
      setInterval: schedule.setInterval,
      clearInterval: schedule.clear,
    });

    await handler(request({ matchId: "m1" }) as never, response as never);

    expect(payloads(response)).toMatchObject([
      {
        latestSnapshot: null,
        history: [],
        historySource: "unavailable",
        replayCursor: 0,
        replayTotal: 0,
        replayComplete: true,
        replayOriginalTimestamp: null,
      },
    ]);
    expect(schedule.setInterval).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it("does not write or start a timer when the client closes during hydration", async () => {
    const response = makeResponse();
    const schedule = capturedSchedule();
    let resolveHistory!: (result: { history: OddsSnapshot[]; source: "archive" }) => void;
    const hydration = new Promise<{ history: OddsSnapshot[]; source: "archive" }>(
      (resolve) => {
        resolveHistory = resolve;
      }
    );
    const handler = createReplayOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockReturnValue(hydration),
      setInterval: schedule.setInterval,
      clearInterval: schedule.clear,
    });
    const req = request({ matchId: "m1" });

    const pending = handler(req as never, response as never);
    req.emit("close");
    resolveHistory({ history: [older, newer], source: "archive" });
    await pending;

    expect(response.write).not.toHaveBeenCalled();
    expect(schedule.setInterval).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});
