import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskSnapshot } from "./RiskSnapshot";

describe("RiskSnapshot", () => {
  it("renders negative P&L without hiding its direction", () => {
    render(
      <RiskSnapshot
        pnl={{ netUnits: -2.5, roiPercent: -8, openPositions: 3, openExposure: 3, settledBets: 31 }}
      />
    );

    expect(screen.getByRole("region", { name: "Risk and P&L" })).toBeInTheDocument();
    expect(screen.getByText("-2.50u")).toHaveClass("text-danger");
    expect(screen.getByText("-8%")).toBeInTheDocument();
    expect(screen.getByText("3.00u")).toBeInTheDocument();
    expect(screen.getByTestId("risk-roi-fill")).toHaveAttribute("data-direction", "negative");
  });

  it("shows explicit zeroes when the payload contains real zeroes", () => {
    render(
      <RiskSnapshot
        pnl={{ netUnits: 0, roiPercent: 0, openPositions: 0, openExposure: 0, settledBets: 0 }}
      />
    );

    expect(screen.getAllByText("0.00u")).toHaveLength(2);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("P&L data unavailable.")).not.toBeInTheDocument();
  });

  it("does not convert a missing payload into zeroes", () => {
    render(<RiskSnapshot pnl={null} />);

    expect(screen.getByText("P&L data unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("0.00u")).not.toBeInTheDocument();
  });
});
