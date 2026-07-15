import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, OddsSnapshot } from "./types";

const { enqueueOddsSnapshotsForArchiveMock, fetchTxLineFeedMock } = vi.hoisted(() => ({
  enqueueOddsSnapshotsForArchiveMock: vi.fn().mockResolvedValue(true),
  fetchTxLineFeedMock: vi.fn(),
}));

vi.mock("./services/archive", () => ({
  archiveMatch: vi.fn().mockResolvedValue(undefined),
  archiveSignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/oddsArchiveOutbox", () => ({
  enqueueOddsSnapshotsForArchive: enqueueOddsSnapshotsForArchiveMock,
}));

vi.mock("./services/txlineClient", () => ({
  fetchTxLineFeed: fetchTxLineFeedMock,
}));

import { processAgentCycle } from "./agent";
import { config } from "./config";
import { store } from "./store";

const match: Match = {
  id: "match-1",
  competition: "World Cup",
  homeTeam: "Team A",
  awayTeam: "Team B",
  homeScore: 0,
  awayScore: 0,
  minute: 20,
  status: "live",
  lastUpdated: "2026-07-15T10:00:00.000Z",
};

const snapshot: OddsSnapshot = {
  id: "snapshot-1",
  matchId: "match-1",
  homeTeam: "Team A",
  awayTeam: "Team B",
  homeOdds: 2,
  drawOdds: 3.2,
  awayOdds: 3.8,
  homeScore: 0,
  awayScore: 0,
  minute: 20,
  source: "txline",
  createdAt: "2026-07-15T10:00:00.000Z",
};

describe("processAgentCycle odds durability", () => {
  beforeEach(() => {
    config.useSimulatedFeed = false;
    store.matches = [];
    store.recentFinishedMatches = [];
    store.oddsSnapshots = [];
    store.signals = [];
    store.agentRuns = [];
    store.duplicatesDropped = { snapshots: 0, signals: 0 };
    enqueueOddsSnapshotsForArchiveMock.mockClear();
    fetchTxLineFeedMock.mockResolvedValue({ matches: [match], snapshots: [snapshot] });
  });

  it("queues every newly accepted real snapshot for durable retry", async () => {
    await processAgentCycle();

    expect(enqueueOddsSnapshotsForArchiveMock).toHaveBeenCalledWith([snapshot]);
  });
});
