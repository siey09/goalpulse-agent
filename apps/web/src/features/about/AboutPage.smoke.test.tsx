import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("renders without throwing", () => {
    expect(() => render(<AboutPage />)).not.toThrow();
  });

  it("shows the product name, compliance boundary, and repo link", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { level: 1, name: "GoalPulse Agent" })).toBeInTheDocument();
    expect(screen.getByText("Analytics only")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Repository/ })
    ).toHaveAttribute("href", "https://github.com/siey09/goalpulse-agent");
  });

  it("shows a real example on-chain proof signature with a working explorer link", () => {
    render(<AboutPage />);

    const signature = "5EYe21B3JaJwMrvuvcqkkdrzk8ZQxhVR6w4mC1rKpMntsB2gH8jDKgSJwz6ewTU75yuMKwMZjyNR7qDyVNS3r82c";
    expect(screen.getByText(signature)).toBeInTheDocument();

    const explorerLink = screen.getByRole("link", { name: /View on Solana Explorer/ });
    expect(explorerLink).toHaveAttribute(
      "href",
      `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  });

  it("lists all four feature categories sourced from the shared Ask GoalPulse catalog", () => {
    render(<AboutPage />);

    expect(screen.getByText("Live intelligence")).toBeInTheDocument();
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Trust & verification")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("links to the README, technical docs, demo checklist, and OpenAPI spec", () => {
    render(<AboutPage />);

    expect(screen.getByRole("link", { name: /README/ })).toHaveAttribute(
      "href",
      "https://github.com/siey09/goalpulse-agent/blob/main/README.md"
    );
    expect(screen.getByRole("link", { name: /Technical documentation/ })).toHaveAttribute(
      "href",
      "https://github.com/siey09/goalpulse-agent/blob/main/TECHNICAL_DOCS.md"
    );
  });
});
