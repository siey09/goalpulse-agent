import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArchivePage } from "./ArchivePage";

describe("ArchivePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing", () => {
    expect(() => render(<ArchivePage />)).not.toThrow();
  });

  it("presents the permanent ledger before a grouped historical analysis region", () => {
    render(<ArchivePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Signal Archive" })
    ).toBeInTheDocument();
    const analysis = screen.getByRole("region", { name: "Historical performance" });
    expect(analysis).toHaveTextContent("Signal performance");
    expect(analysis).toHaveTextContent("Confidence calibration");
  });
});
