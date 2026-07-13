import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReplayLabPage } from "./ReplayLabPage";

const baseProps = {
  replayBacktest: null,
  pnl: null,
  isReplayRunning: false,
  onRunAudit: vi.fn(),
  selectedSignal: null,
  onSelectSignal: vi.fn(),
  onchainVerify: {},
  onVerify: vi.fn(),
};

describe("ReplayLabPage", () => {
  it("renders without throwing and shows the explanatory paragraph before any backtest has run", () => {
    expect(() => render(<ReplayLabPage {...baseProps} />)).not.toThrow();
    expect(
      screen.getByText(/Replay a saved World Cup odds sequence/)
    ).toBeInTheDocument();
  });

  it("shows no ErrorState when error is empty", () => {
    render(<ReplayLabPage {...baseProps} error="" />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("shows ErrorState with the message when a Run Audit attempt failed", () => {
    render(<ReplayLabPage {...baseProps} error="Unable to run replay backtest." />);
    expect(screen.getByText("Unable to run replay backtest.")).toBeInTheDocument();
  });

  it("Retry calls onRunAudit", () => {
    const onRunAudit = vi.fn();
    render(<ReplayLabPage {...baseProps} onRunAudit={onRunAudit} error="Request failed." />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRunAudit).toHaveBeenCalledOnce();
  });

  it("still renders backtest summary content alongside a present error", () => {
    render(
      <ReplayLabPage
        {...baseProps}
        error="Unable to run replay backtest."
        replayBacktest={{
          mode: "real_txline_replay",
          summary: { snapshotsProcessed: 800, signalsDetected: 66, correctSignals: 7, incorrectSignals: 9 },
        }}
      />
    );
    expect(screen.getByText("Unable to run replay backtest.")).toBeInTheDocument();
    expect(screen.getByText("Real TxLINE replay")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });
});
