import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LiveMarketsPage } from "./LiveMarketsPage";
import type { Match } from "../../types";

const selectedMatch: Match = {
  id: "m1",
  homeTeam: "Norway",
  awayTeam: "England",
  homeScore: 1,
  awayScore: 0,
  status: "live",
  odds: { homeOdds: 1.85, drawOdds: 3.4, awayOdds: 4.2 },
};

const baseProps = {
  selectedMatch,
  chartData: [
    { id: "s1", name: "S1", timelineX: 0, hasRealTimestamp: false, rawTimestamp: "", snapshotLabel: "TxLINE snapshot 1", timelineLabel: "Capture time unavailable", home: 1.9, away: 4.1 },
    { id: "s2", name: "S2", timelineX: 1, hasRealTimestamp: false, rawTimestamp: "", snapshotLabel: "TxLINE snapshot 2", timelineLabel: "Capture time unavailable", home: 1.85, away: 4.2 },
  ],
  chartSignalMarkers: [],
  chartReadout: {
    homeCurrent: "1.85",
    drawCurrent: "3.40",
    awayCurrent: "4.20",
    verdict: "Market steady",
    meaning: "No material move yet.",
    signalStatus: "No signal marker on this chart yet",
    severity: {
      tier: "Watch",
      cardClass: "border-white/10 bg-black/20",
      textClass: "text-stone-300",
      dotClass: "bg-stone-400",
      badgeClass: "border-white/10 text-stone-300",
    },
  },
  isReplayStreamMode: false,
  onToggleReplayStreamMode: vi.fn(),
  isOddsStreamLive: true,
  oddsStreamLastUpdate: "11:12 PM",
  replayStreamProgress: undefined,
  streamProgressPercent: 0,
  health: null,
  correctSignals: 3,
  closedSignals: 5,
  selectedMatchMarketPressure: { homePressure: 62, awayPressure: 38, leader: "Norway", hasData: true },
  fieldContext: { label: "Field-backed", tone: "positive" as const },
  hasDroppedUpdate: false,
  matches: [selectedMatch],
  matchStatusFilter: "all",
  onChangeMatchStatusFilter: vi.fn(),
  matchStatusCounts: { all: 1, live: 1, scheduled: 0, finished: 0 },
  selectedMatchId: "m1",
  onSelectMatch: vi.fn(),
  onSelectSignalId: vi.fn(),
};

describe("LiveMarketsPage", () => {
  it("renders one heading and connects the fixture rail to the selected workspace", () => {
    render(<LiveMarketsPage {...baseProps} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("region", { name: /fixture rail/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^selected market$/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /odds movement/i })).toBeInTheDocument();
    expect(document.getElementById("guide-market-board")).not.toBeNull();
    expect(document.getElementById("guide-selected-match")).not.toBeNull();
    expect(document.getElementById("guide-odds-chart")).not.toBeNull();
  });

  it("renders the authoritative feed state once", () => {
    render(<LiveMarketsPage {...baseProps} isOddsStreamLive />);
    expect(screen.getAllByLabelText("Feed state: Live")).toHaveLength(1);
  });

  it("keeps selected identity visible when snapshots are empty", () => {
    render(<LiveMarketsPage {...baseProps} chartData={[]} />);
    expect(within(screen.getByRole("region", { name: /^selected market$/i })).getByText("Norway vs England")).toBeInTheDocument();
    expect(screen.getByText(/no TxLINE snapshots for Norway vs England yet/i)).toBeInTheDocument();
  });
});
