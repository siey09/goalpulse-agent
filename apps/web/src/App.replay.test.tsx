import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type EventHandler = (event: Event | MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, EventHandler[]>();
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: EventHandler) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    const event = type === "odds-update"
      ? new MessageEvent(type, { data: JSON.stringify(data) })
      : new Event(type);
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
}

const matches = [
  { id: "m1", homeTeam: "Norway", awayTeam: "England", homeScore: 0, awayScore: 0, minute: 10, status: "finished" },
  { id: "m2", homeTeam: "Japan", awayTeam: "Brazil", homeScore: 0, awayScore: 0, minute: 10, status: "finished" },
];
const snapshots = [
  { id: "s1", matchId: "m1", homeTeam: "Norway", awayTeam: "England", homeOdds: 2, drawOdds: 3, awayOdds: 4, source: "txline", createdAt: "2026-07-11T22:00:00.000Z" },
  { id: "s2", matchId: "m1", homeTeam: "Norway", awayTeam: "England", homeOdds: 1.8, drawOdds: 3.2, awayOdds: 4.2, source: "txline", createdAt: "2026-07-11T22:05:00.000Z" },
];
const futureSignal = {
  id: "future-signal",
  matchId: "m1",
  match: "Norway vs England",
  target: "Norway",
  side: "home",
  signalType: "SHARP_MOVE",
  severity: "HIGH",
  oddsBefore: 2,
  oddsAfter: 1.8,
  oddsChangePct: -10,
  createdAt: snapshots[1].createdAt,
};

function response(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

function installDashboardFetch() {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/health")) return response({ ok: true, liveStream: { connected: true, totalEventsReceived: 2 } });
    if (url.endsWith("/api/matches")) return response({ data: matches });
    if (url.endsWith("/api/recent-results")) return response({ data: [] });
    if (url.endsWith("/api/signals")) return response({ data: [futureSignal] });
    if (url.endsWith("/api/agent-runs")) return response({ data: [] });
    if (url.endsWith("/api/stats")) return response({ correctSignals: 0, closedSignals: 0 });
    if (url.endsWith("/api/pnl")) return response({ data: null });
    if (url.endsWith("/api/arena")) return response({});
    return response({ data: [] });
  }));
}

async function openLiveMarkets() {
  render(<App />);
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  fireEvent.click(screen.getAllByRole("button", { name: "Live Markets" })[0]);
  await screen.findByRole("heading", { name: "Live Markets" });
}

function emitLiveHistory(source: FakeEventSource) {
  act(() => source.emit("odds-update", {
    match: matches[0],
    history: snapshots,
    signals: [futureSignal],
    timestamp: snapshots[1].createdAt,
    streamMode: "live",
  }));
}

function emitReplayFrame(source: FakeEventSource, cursor: 1 | 2) {
  act(() => source.emit("odds-update", {
    match: matches[0],
    history: snapshots.slice(0, cursor),
    signals: cursor === 1 ? [] : [futureSignal],
    timestamp: snapshots[cursor - 1].createdAt,
    streamMode: "replay_test",
    replayCursor: cursor,
    replayTotal: 2,
    replayComplete: cursor === 2,
    replayOriginalTimestamp: snapshots[cursor - 1].createdAt,
  }));
}

describe("App controlled replay lifecycle", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    installDashboardFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores queued messages from stale fixture, speed, and restart sessions and hides future replay signals", async () => {
    await openLiveMarkets();
    emitLiveHistory(FakeEventSource.instances[0]);
    fireEvent.click(screen.getByRole("button", { name: /^play replay$/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const firstReplay = FakeEventSource.instances[1];
    emitReplayFrame(firstReplay, 1);

    expect(screen.getByRole("status", { name: /replay state/i })).toHaveTextContent(/Snapshot 1 of 2/i);
    expect(screen.getByText("0 signals plotted")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /replay speed/i }), { target: { value: "2" } });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(3));
    const speedReplay = FakeEventSource.instances[2];
    vi.useFakeTimers();
    act(() => {
      firstReplay.emit("open");
      firstReplay.emit("error");
    });
    emitReplayFrame(firstReplay, 2);
    act(() => vi.advanceTimersByTime(2000));
    expect(FakeEventSource.instances).toHaveLength(3);
    vi.useRealTimers();
    expect(screen.getByRole("status", { name: /replay state/i })).toHaveTextContent(/Snapshot 1 of 2/i);
    expect(screen.getByText("0 signals plotted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restart replay/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(4));
    emitReplayFrame(speedReplay, 2);
    expect(screen.getByRole("status", { name: /replay state/i })).toHaveTextContent(/Snapshot 0 of 0/i);

    const fixtureRail = screen.getByRole("region", { name: /fixture rail/i });
    fireEvent.click(within(fixtureRail).getByRole("button", { name: /Japan vs Brazil/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(5));
    emitReplayFrame(FakeEventSource.instances[3], 2);
    expect(within(screen.getByRole("region", { name: /^selected market$/i })).getByText("Japan vs Brazil")).toBeInTheDocument();
  });

  it("pauses at the preserved cursor with recovery actions when bounded retries are exhausted", async () => {
    await openLiveMarkets();
    emitLiveHistory(FakeEventSource.instances[0]);
    fireEvent.click(screen.getByRole("button", { name: /^play replay$/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    emitReplayFrame(FakeEventSource.instances[1], 1);

    vi.useFakeTimers();
    for (const delay of [250, 500, 1000]) {
      act(() => FakeEventSource.instances.at(-1)!.emit("error"));
      await act(async () => vi.advanceTimersByTime(delay));
    }
    act(() => FakeEventSource.instances.at(-1)!.emit("error"));

    expect(screen.getByRole("status", { name: /replay connection/i })).toHaveTextContent(/paused at the last confirmed snapshot/i);
    expect(screen.getByRole("status", { name: /replay state/i })).toHaveTextContent(/Snapshot 1 of 2/i);
    expect(screen.getByRole("button", { name: /resume replay/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart replay/i })).toBeEnabled();
  });
});
