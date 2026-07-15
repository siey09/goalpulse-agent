import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../store";
import type { Match, OddsSnapshot } from "../types";
import { createLiveOddsStreamHandler } from "./liveOddsStream";

const match: Match = {
  id: "18213979",
  competition: "World Cup",
  homeTeam: "Norway",
  awayTeam: "England",
  homeScore: 1,
  awayScore: 2,
  minute: 90,
  status: "finished",
  lastUpdated: "2026-07-11T23:59:57.382Z",
};

const snapshot: OddsSnapshot = {
  id: "snapshot-1",
  matchId: "18213979",
  homeTeam: "Norway",
  awayTeam: "England",
  homeOdds: 2,
  drawOdds: 3.2,
  awayOdds: 3.8,
  homeScore: 1,
  awayScore: 2,
  minute: 90,
  source: "txline",
  createdAt: "2026-07-11T22:00:00.000Z",
};

function makeRequestAndResponse() {
  const request = new EventEmitter() as EventEmitter & { query: Record<string, string> };
  request.query = { matchId: match.id };
  const response = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return { request, response };
}

describe("live odds stream history recovery", () => {
  beforeEach(() => {
    store.matches = [];
    store.recentFinishedMatches = [match];
    store.oddsSnapshots = [];
    store.signals = [];
    store.agentRuns = [];
  });

  it("puts recovered finished history in the first SSE payload", async () => {
    const { request, response } = makeRequestAndResponse();
    const setIntervalMock = vi.fn().mockReturnValue(12);
    const handler = createLiveOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockResolvedValue({
        history: [snapshot],
        source: "archive",
      }),
      setInterval: setIntervalMock,
      clearInterval: vi.fn(),
    });

    await handler(request as never, response as never);

    const firstWrite = response.write.mock.calls[0][0] as string;
    expect(firstWrite).toContain('"historySource":"archive"');
    expect(firstWrite).toContain('"id":"snapshot-1"');
    expect(setIntervalMock).toHaveBeenCalledTimes(1);
  });

  it("lets newly arriving hot snapshots supersede recovered history", async () => {
    const { request, response } = makeRequestAndResponse();
    let tick!: () => void;
    const handler = createLiveOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockResolvedValue({
        history: [snapshot],
        source: "archive",
      }),
      setInterval: vi.fn((callback) => {
        tick = callback;
        return 12 as never;
      }),
      clearInterval: vi.fn(),
    });

    await handler(request as never, response as never);
    store.oddsSnapshots = [
      {
        ...snapshot,
        id: "live-snapshot",
        homeOdds: 1.8,
        createdAt: "2026-07-11T22:05:00.000Z",
      },
    ];
    tick();

    const latestWrite = response.write.mock.calls.at(-1)?.[0] as string;
    expect(response.write).toHaveBeenCalledTimes(2);
    expect(latestWrite).toContain('"id":"live-snapshot"');
    expect(latestWrite).toContain('"id":"snapshot-1"');
  });

  it("does not start a write interval when the client disconnects during recovery", async () => {
    const { request, response } = makeRequestAndResponse();
    let resolveRecovery!: (value: { history: OddsSnapshot[]; source: "archive" }) => void;
    const recovery = new Promise<{ history: OddsSnapshot[]; source: "archive" }>((resolve) => {
      resolveRecovery = resolve;
    });
    const setIntervalMock = vi.fn();
    const handler = createLiveOddsStreamHandler({
      ensureMatchOddsHistory: vi.fn().mockReturnValue(recovery),
      setInterval: setIntervalMock,
      clearInterval: vi.fn(),
    });

    const pending = handler(request as never, response as never);
    request.emit("close");
    resolveRecovery({ history: [snapshot], source: "archive" });
    await pending;

    expect(response.write).not.toHaveBeenCalled();
    expect(setIntervalMock).not.toHaveBeenCalled();
  });
});
