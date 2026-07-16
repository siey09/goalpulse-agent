import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { VerificationEvidenceChain } from "./VerificationEvidenceChain";

it("shows every evidence boundary without claiming missing proof", () => {
  const item = {
    signal: {
      id: "s1",
      match: "Norway vs England",
      target: "England",
      type: "STEAM_MOVE",
      evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
    },
    source: "Live monitor",
  };

  render(<VerificationEvidenceChain item={item} verifyState={{}} />);

  expect(screen.getByText("Live monitor")).toBeInTheDocument();
  expect(screen.getByText(/Fixture 10/)).toBeInTheDocument();
  expect(screen.getByText(/Sequence 8/)).toBeInTheDocument();
  expect(screen.getByText("Ready to verify")).toBeInTheDocument();
});

it("names a missing TXODDS sequence explicitly", () => {
  render(
    <VerificationEvidenceChain
      item={{ signal: { id: "s2", match: "France vs Spain" }, source: "Replay audit" }}
      verifyState={{}}
    />
  );

  expect(
    screen.getByText("No exact TXODDS sequence is attached to this signal.")
  ).toBeInTheDocument();
});
