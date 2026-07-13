import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders an optional subtitle as part of the heading group", () => {
    render(
      <SectionHeader
        eyebrow="Selected fixture"
        title="Market Pulse"
        subtitle="Norway vs England"
      />
    );

    expect(screen.getByRole("heading", { name: "Market Pulse" })).toBeInTheDocument();
    expect(screen.getByText("Norway vs England")).toBeInTheDocument();
  });

  it("supports compact and primary density without changing the heading level", () => {
    const { rerender } = render(
      <SectionHeader eyebrow="Trust" title="Verification" size="compact" />
    );

    expect(screen.getByTestId("section-header")).toHaveAttribute("data-size", "compact");
    expect(screen.getByRole("heading", { level: 2, name: "Verification" })).toBeInTheDocument();

    rerender(<SectionHeader eyebrow="Priority" title="Top signal" size="primary" />);

    expect(screen.getByTestId("section-header")).toHaveAttribute("data-size", "primary");
    expect(screen.getByRole("heading", { level: 2, name: "Top signal" })).toBeInTheDocument();
  });
});
