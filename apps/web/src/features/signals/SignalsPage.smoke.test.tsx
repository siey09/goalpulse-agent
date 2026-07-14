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

    fireEvent.click(screen.getByRole("button", { name: "Inspect signal: Alpha FC v Beta United" }));
    expect(onSelectSignal).toHaveBeenCalledWith(items[0].signal);
  });

  it("sorts a copied queue newest-first and leaves invalid timestamps at the end deterministically", () => {
    const invalidTimestamp: OutcomeVerificationItem = {
      source: "Invalid clock",
      signal: { ...items[0].signal, id: "signal-invalid", match: "Invalid Date FC", createdAt: "not-a-date" },
    };
    const missingTimestamp: OutcomeVerificationItem = {
      source: "Missing clock",
      signal: { ...items[0].signal, id: "signal-missing", match: "Missing Date FC", createdAt: undefined },
    };
    const input = [items[0], invalidTimestamp, items[2], missingTimestamp, items[1]];

    render(<SignalsPage outcomeVerificationItems={input} onSelectSignal={() => {}} />);

    const queue = screen.getByRole("region", { name: "Signal queue" });
    expect(within(queue).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Epsilon Athletic v Zeta Town",
      "Gamma City v Delta Rovers",
      "Alpha FC v Beta United",
      "Invalid Date FC",
      "Missing Date FC",
    ]);
    expect(input.map(({ signal }) => signal.match)).toEqual([
      "Alpha FC v Beta United",
      "Invalid Date FC",
      "Epsilon Athletic v Zeta Town",
      "Missing Date FC",
      "Gamma City v Delta Rovers",
    ]);
  });

  it("binds semantic colors only to their documented evidence states", () => {
    render(<SignalsPage outcomeVerificationItems={items} onSelectSignal={() => {}} />);
    const queue = screen.getByRole("region", { name: "Signal queue" });
    const highRow = within(queue).getByText("Alpha FC v Beta United").closest("li")!;
    const lowRow = within(queue).getByText("Gamma City v Delta Rovers").closest("li")!;
    const mediumRow = within(queue).getByText("Epsilon Athletic v Zeta Town").closest("li")!;

    expect(within(highRow).getByText("HIGH")).toHaveClass("text-danger-200");
    expect(within(mediumRow).getByText("MEDIUM")).toHaveClass("text-warning-200");
    expect(within(highRow).getByText("CORRECT")).toHaveClass("text-stone-300");
    expect(within(mediumRow).getByText("INCORRECT")).toHaveClass("text-stone-300");

    const highFieldCell = within(highRow).getByText("Field").parentElement!;
    const lowFieldCell = within(lowRow).getByText("Field").parentElement!;
    expect(highFieldCell).toHaveClass("border-t-positive");
    expect(within(highFieldCell).getByText("30")).toHaveClass("text-positive-200");
    expect(lowFieldCell).not.toHaveClass("border-t-positive");
    expect(within(lowFieldCell).getByText("10")).toHaveClass("text-stone-300");

    const linkedProofCell = within(highRow).getByText("Proof").parentElement!;
    const pendingProofCell = within(lowRow).getByText("Proof").parentElement!;
    expect(linkedProofCell).toHaveClass("border-t-proof");
    expect(within(linkedProofCell).getByText("Linked")).toHaveClass("text-proof-200");
    expect(pendingProofCell).not.toHaveClass("border-t-proof");
    expect(within(pendingProofCell).getByText("Pending")).toHaveClass("text-stone-300");

    const marketCell = within(highRow).getByText("Market").parentElement!;
    expect(marketCell).toHaveClass("border-t-info");
    expect(within(marketCell).getByText("-24.17%")).toHaveClass("text-info-200");
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
    const queue = screen.getByRole("region", { name: "Signal queue" });

    for (const [term, expectedMatch] of [
      ["Gamma City", "Gamma City v Delta Rovers"],
      ["Over 2.5", "Epsilon Athletic v Zeta Town"],
      ["sharp money", "Alpha FC v Beta United"],
      ["Backtest archive", "Epsilon Athletic v Zeta Town"],
    ]) {
      fireEvent.change(search, { target: { value: term } });
      expect(screen.getByText("1 signal shown")).toBeInTheDocument();
      expect(within(queue).getByText(expectedMatch)).toBeInTheDocument();
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
