import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerificationPage } from "./VerificationPage";

const readyItem = {
  signal: {
    id: "s1",
    match: "Norway vs England",
    target: "England",
    type: "STEAM_MOVE",
    severity: "HIGH",
    createdAt: "2026-07-16T08:00:00.000Z",
    evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
  },
  source: "Live monitor",
};

const fingerprintItem = {
  signal: {
    id: "s2",
    match: "France vs Spain",
    target: "Spain",
    type: "MOMENTUM_SHIFT",
  },
  source: "TxLINE replay audit",
  proofHash: "abcdef1234567890",
};

describe("VerificationPage", () => {
  it("renders a dense evidence desk and defaults to the first object", () => {
    render(
      <VerificationPage
        verificationObjects={[readyItem, fingerprintItem]}
        selectedSignal={null}
        onSelectSignal={vi.fn()}
        onchainVerify={{}}
        onVerify={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Verification Evidence Desk" })
    ).toBeInTheDocument();
    expect(screen.getByText("2 objects")).toBeInTheDocument();
    expect(screen.getByText("On-chain eligible").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Local fingerprints").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("region", { name: "Selected proof inspector" })).toHaveTextContent(
      "Norway vs England"
    );
    expect(screen.getByRole("heading", { name: "Trust model" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "On-chain verification requires an exact TxLINE event sequence from the upstream feed. When that sequence is unavailable, GoalPulse preserves the signal but does not invent or infer a proof."
    );
  });

  it("routes queue selection through the existing callback", () => {
    const onSelectSignal = vi.fn();
    render(
      <VerificationPage
        verificationObjects={[readyItem, fingerprintItem]}
        selectedSignal={readyItem.signal}
        onSelectSignal={onSelectSignal}
        onchainVerify={{}}
        onVerify={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /France vs Spain/i }));
    expect(onSelectSignal).toHaveBeenCalledWith(fingerprintItem.signal);
  });

  it("explains exactly when no verification object exists", () => {
    render(
      <VerificationPage
        verificationObjects={[]}
        selectedSignal={null}
        onSelectSignal={vi.fn()}
        onchainVerify={{}}
        onVerify={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "Verification objects appear after the live monitor or Replay Lab generates a signal."
      )
    ).toBeInTheDocument();
  });
});
