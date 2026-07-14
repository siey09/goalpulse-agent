import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SignalsPage, type OutcomeVerificationItem } from "./SignalsPage";

const items: OutcomeVerificationItem[] = [
  {
    source: "Live TXODDS",
    proofHash: "0x1234567890abcdef1234567890abcdef",
    signal: {
      id: "signal-high",
      match: "Alpha FC v Beta United",
      target: "Alpha FC",
      type: "SHARP_MONEY",
      severity: "HIGH",
      oddsBefore: 2.4,
      oddsAfter: 1.82,
      oddsChangePct: -24.17,
      confidence: 88,
      createdAt: "2026-07-14T01:00:00.000Z",
      resultStatus: "correct",
      evidence: { scoresContext: { fieldPressureScore: 30 } },
    },
  },
  {
    source: "Replay feed",
    signal: {
      id: "signal-low",
      match: "Gamma City v Delta Rovers",
      target: "Draw",
      signalType: "MOMENTUM_SHIFT",
      severity: "LOW",
      oddsBefore: 3.1,
      oddsAfter: 3,
      oddsChangePct: -3.23,
      confidenceScore: 54,
      createdAt: "2026-07-14T01:05:00.000Z",
      resultStatus: "pending",
      evidence: { scoresContext: { fieldPressureScore: 10 } },
    },
  },
  {
    source: "Backtest archive",
    proofHash: "0xabcdefabcdefabcdefabcdefabcdefab",
    signal: {
      id: "signal-medium",
      match: "Epsilon Athletic v Zeta Town",
      target: "Over 2.5",
      type: "STEAM_MOVE",
      severity: "MEDIUM",
      oddsBefore: 1.95,
      oddsAfter: 1.72,
      oddsChangePct: -11.79,
      confidence: 72,
      createdAt: "2026-07-14T01:10:00.000Z",
      resultStatus: "incorrect",
      evidence: { scoresContext: { fieldPressureScore: 22 } },
    },
  },
];

describe("SignalsPage", () => {
  beforeEach(() => {
    // The analysis panels fetch their own data on mount. Keep those real
    // components in the hierarchy while preventing network calls in tests.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the triage hierarchy and inspects a queue signal", () => {
    const onSelectSignal = vi.fn();
    render(<SignalsPage outcomeVerificationItems={items} onSelectSignal={onSelectSignal} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Signal Triage" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signal queue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Live pattern scan" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signal explainability" })).toBeInTheDocument();
    expect(screen.getByText("3 signals shown")).toBeInTheDocument();
    expect(screen.getByText("INCORRECT")).toHaveClass("text-danger-200");

    fireEvent.click(screen.getByRole("button", { name: "Inspect signal: Alpha FC v Beta United" }));
    expect(onSelectSignal).toHaveBeenCalledWith(items[0].signal);
  });

  it("filters the queue by priority, field evidence, and settled outcomes", () => {
    render(<SignalsPage outcomeVerificationItems={items} onSelectSignal={() => {}} />);
    const queue = screen.getByRole("region", { name: "Signal queue" });

    fireEvent.click(screen.getByRole("button", { name: "High priority" }));
    expect(screen.getByText("1 signal shown")).toBeInTheDocument();
    expect(within(queue).getByText("Alpha FC v Beta United")).toBeInTheDocument();
    expect(within(queue).queryByText("Gamma City v Delta Rovers")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Field-backed" }));
    expect(screen.getByText("2 signals shown")).toBeInTheDocument();
    expect(within(queue).getByText("Epsilon Athletic v Zeta Town")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settled" }));
    expect(screen.getByText("2 signals shown")).toBeInTheDocument();
    expect(within(queue).queryByText("Gamma City v Delta Rovers")).not.toBeInTheDocument();
  });

  it("searches match, target, signal type, and source", () => {
    render(<SignalsPage outcomeVerificationItems={items} onSelectSignal={() => {}} />);
    const search = screen.getByRole("searchbox", { name: "Search signals" });

    for (const term of ["Gamma City", "Over 2.5", "sharp money", "Backtest archive"]) {
      fireEvent.change(search, { target: { value: term } });
      expect(screen.getByText("1 signal shown")).toBeInTheDocument();
    }
  });

  it("explains unfiltered and filtered empty queues honestly", () => {
    const { rerender } = render(<SignalsPage outcomeVerificationItems={[]} onSelectSignal={() => {}} />);

    expect(screen.getByText(/waiting for a live signal or replay/i)).toBeInTheDocument();

    rerender(<SignalsPage outcomeVerificationItems={items} onSelectSignal={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search signals" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText(/No signals match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toHaveClass("min-h-11");
  });
});
