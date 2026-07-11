import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignalArchivePanel } from "./SignalArchivePanel";

const archiveResponse = {
  data: [
    {
      signalId: "sig-42",
      event: "settled",
      matchId: "m1",
      side: "home",
      signalType: "SHARP_MOVE",
      severity: "HIGH",
      resultStatus: "correct",
      momentumScore: 88,
      oddsChangePct: 25.16,
      archivedAt: "2026-07-04T12:00:00.000Z",
      signalData: {
        match: "Colombia vs Ghana",
        target: "Colombia",
        explanation: "Colombia odds compressed sharply.",
        confidenceScore: 90,
      },
    },
  ],
  pagination: { page: 1, pageSize: 25, totalCount: 1, totalPages: 1 },
};

describe("SignalArchivePanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(archiveResponse),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing when the fetch fails", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
    expect(() => render(<SignalArchivePanel />)).not.toThrow();
  });

  it("maps an archive entry to a signal and calls onSelectSignal when a row is clicked", async () => {
    const onSelectSignal = vi.fn();
    render(<SignalArchivePanel onSelectSignal={onSelectSignal} />);

    const entryButton = await waitFor(() => screen.getByText("Colombia vs Ghana"));
    fireEvent.click(entryButton.closest("button")!);

    expect(onSelectSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sig-42",
        matchId: "m1",
        match: "Colombia vs Ghana",
        target: "Colombia",
        side: "home",
        type: "SHARP_MOVE",
        severity: "HIGH",
        resultStatus: "correct",
      })
    );
  });

  it("does not throw when a row is clicked and onSelectSignal is omitted", async () => {
    render(<SignalArchivePanel />);
    const entryButton = await waitFor(() => screen.getByText("Colombia vs Ghana"));
    expect(() => fireEvent.click(entryButton.closest("button")!)).not.toThrow();
  });
});
