import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VerificationObjectQueue } from "./VerificationObjectQueue";

it("renders readiness and selects a verification object", () => {
  const onSelect = vi.fn();
  const item = {
    signal: {
      id: "s1",
      match: "Norway vs England",
      target: "England",
      type: "STEAM_MOVE",
      createdAt: "2026-07-16T08:00:00.000Z",
      evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
    },
    source: "Live monitor",
  };

  render(
    <VerificationObjectQueue
      items={[item]}
      selectedSignal={null}
      verifyState={{}}
      onSelect={onSelect}
    />
  );

  expect(screen.getByText("Ready to verify")).toBeInTheDocument();
  expect(screen.getByText("Live monitor")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Norway vs England/i }));
  expect(onSelect).toHaveBeenCalledWith(item.signal);
});

it("marks the selected object and exposes its local fingerprint", () => {
  const item = {
    signal: { id: "s2", match: "France vs Spain" },
    source: "TxLINE replay audit",
    proofHash: "abc123",
  };

  render(
    <VerificationObjectQueue
      items={[item]}
      selectedSignal={item.signal}
      verifyState={{}}
      onSelect={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: /France vs Spain/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(screen.getByText("Fingerprint linked")).toBeInTheDocument();
  expect(screen.getByText("No sequence")).toBeInTheDocument();
});
