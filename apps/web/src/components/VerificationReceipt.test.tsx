import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VerificationReceipt } from "./VerificationReceipt";

const signal = {
  id: "s1",
  match: "Norway vs England",
  evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
};

it("renders the workspace receipt without changing the compact default", () => {
  const { rerender } = render(
    <VerificationReceipt selectedSignal={signal} onchainVerify={{}} onVerify={vi.fn()} />
  );

  expect(screen.getByTestId("verification-receipt")).toHaveAttribute(
    "data-variant",
    "compact"
  );

  rerender(
    <VerificationReceipt
      variant="workspace"
      selectedSignal={signal}
      onchainVerify={{}}
      onVerify={vi.fn()}
    />
  );

  expect(screen.getByTestId("verification-receipt")).toHaveAttribute(
    "data-variant",
    "workspace"
  );
  expect(screen.getByRole("button", { name: /Verify Norway vs England on Solana/i })).toHaveClass(
    "min-h-11"
  );
});

it("shows a valid on-chain result and explorer destination", () => {
  render(
    <VerificationReceipt
      variant="workspace"
      selectedSignal={signal}
      onchainVerify={{
        "10-8": {
          loading: false,
          data: {
            available: true,
            isValid: true,
            provenStat: { key: 4, value: 2, period: 1 },
            dailyScoresPda: "pda-address",
          },
        },
      }}
      onVerify={vi.fn()}
    />
  );

  expect(screen.getByText("PROOF VALID")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View PDA on Solana Explorer" })).toHaveAttribute(
    "href",
    "https://explorer.solana.com/address/pda-address"
  );
});
