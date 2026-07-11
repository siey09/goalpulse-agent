import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandCenterPage } from "./CommandCenterPage";

const baseProps = {
  kpis: {
    liveFixtures: 4,
    feedFreshnessLabel: "updated 3s ago",
    signalsInWindow: 100,
    openSimulatedPositions: 3,
  },
  selectedFixtureLabel: "Norway vs England",
  chartData: [
    { name: "11:00 PM", home: 3.9, away: 2.1 },
    { name: "11:01 PM", home: 3.7, away: 2.2 },
  ],
  decisionFeed: [{ title: "Feed ingested", detail: "10 match record(s) normalized", time: "11:12 PM" }],
  latestSignal: {
    severityLabel: "HIGH",
    target: "Draw",
    priceMoveLabel: "39.54%",
  },
  systemHealthLabel: "Streams connected",
};

describe("CommandCenterPage", () => {
  it("renders with representative mocked data given to it", () => {
    render(<CommandCenterPage {...baseProps} />);

    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
    expect(screen.getByText("Live fixtures")).toBeInTheDocument();
    expect(screen.getByText("HIGH · Draw")).toBeInTheDocument();
    expect(screen.getByText("Streams connected")).toBeInTheDocument();
  });

  it("shows an honest empty state instead of a fake chart when fewer than two points exist", () => {
    render(<CommandCenterPage {...baseProps} chartData={[]} />);
    expect(
      screen.getByText(/Fewer than two comparable odds points yet/)
    ).toBeInTheDocument();
  });

  it("shows an honest empty state instead of fabricating a latest signal", () => {
    render(<CommandCenterPage {...baseProps} latestSignal={null} />);
    expect(
      screen.getByText("No signal crossed the deterministic threshold in this window.")
    ).toBeInTheDocument();
  });

  it("honestly marks Strategy Leader and Verification as not wired yet, rather than showing fake numbers", () => {
    render(<CommandCenterPage {...baseProps} />);
    expect(screen.getAllByText(/Not available in this Phase 2 preview/)).toHaveLength(2);
  });
});
