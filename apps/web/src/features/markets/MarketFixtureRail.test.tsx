import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Match } from "../../types";
import { MarketFixtureRail } from "./MarketFixtureRail";

const matches: Match[] = [
  { id: "finished", homeTeam: "Japan", awayTeam: "Spain", status: "finished", homeScore: 1, awayScore: 2 },
  { id: "live", homeTeam: "Norway", awayTeam: "England", status: "live", minute: 67, homeScore: 1, awayScore: 0 },
  { id: "scheduled", homeTeam: "Brazil", awayTeam: "France", status: "scheduled" },
];

describe("MarketFixtureRail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("orders live fixtures first in All and selects a fixture", () => {
    const onSelectMatch = vi.fn();

    render(
      <MarketFixtureRail
        matches={matches}
        matchStatusFilter="all"
        onChangeMatchStatusFilter={vi.fn()}
        matchStatusCounts={{ all: 3, live: 1, scheduled: 1, finished: 1 }}
        selectedMatchId="finished"
        onSelectMatch={onSelectMatch}
      />
    );

    const fixtureButtons = screen.getAllByRole("button", { name: /inspect market/i });
    expect(fixtureButtons[0]).toHaveAccessibleName(/Norway vs England/i);
    fireEvent.click(fixtureButtons[0]);
    expect(onSelectMatch).toHaveBeenCalledWith("live");
  });

  it("changes filters and offers a return to All from an empty filter", () => {
    const onChange = vi.fn();

    render(
      <MarketFixtureRail
        matches={[]}
        matchStatusFilter="live"
        onChangeMatchStatusFilter={onChange}
        matchStatusCounts={{ all: 2, live: 0, scheduled: 2, finished: 0 }}
        selectedMatchId=""
        onSelectMatch={vi.fn()}
      />
    );

    expect(screen.getByText(/no live fixtures/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show all fixtures/i }));
    expect(onChange).toHaveBeenCalledWith("all");
    expect(within(screen.getByRole("region", { name: /fixture rail/i })).getByText("Live")).toBeInTheDocument();
  });

  it("collapses the fixture list behind a compact selector below desktop", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <MarketFixtureRail
        matches={matches}
        selectedMatch={matches[1]}
        matchStatusFilter="all"
        onChangeMatchStatusFilter={vi.fn()}
        matchStatusCounts={{ all: 3, live: 1, scheduled: 1, finished: 1 }}
        selectedMatchId="live"
        onSelectMatch={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /inspect market for Norway vs England/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change fixture/i }));
    expect(screen.getByRole("button", { name: /inspect market for Norway vs England/i })).toBeInTheDocument();
  });

  it("falls back to All for an invalid persisted filter", () => {
    render(
      <MarketFixtureRail
        matches={matches}
        matchStatusFilter="unexpected"
        onChangeMatchStatusFilter={vi.fn()}
        matchStatusCounts={{ all: 3, live: 1, scheduled: 1, finished: 1 }}
        selectedMatchId="live"
        onSelectMatch={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^All/i })).toHaveAttribute("aria-pressed", "true");
  });
});
