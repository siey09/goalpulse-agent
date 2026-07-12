import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    { name: "S1", home: 1.9, away: 4.1 },
    { name: "S2", home: 1.85, away: 4.2 },
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
  it("renders without throwing", () => {
    expect(() => render(<LiveMarketsPage {...baseProps} />)).not.toThrow();
  });

  it("renders the Selected match card with team names and market pressure", () => {
    render(<LiveMarketsPage {...baseProps} />);
    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
    expect(screen.getByText("Market pressure")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("shows a fallback label when no match is selected yet", () => {
    render(<LiveMarketsPage {...baseProps} selectedMatch={undefined} />);
    expect(screen.getByText("No match yet")).toBeInTheDocument();
  });
});
