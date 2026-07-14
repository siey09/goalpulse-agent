import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

    const inspectButtons = await screen.findAllByRole("button", {
      name: "Inspect Colombia vs Ghana",
    });
    fireEvent.click(inspectButtons[0]);

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
    const inspectButtons = await screen.findAllByRole("button", {
      name: "Inspect Colombia vs Ghana",
    });
    expect(() => fireEvent.click(inspectButtons[0])).not.toThrow();
  });

  it("renders a labeled evidence ledger and consolidated filters", async () => {
    render(<SignalArchivePanel />);

    expect(
      await screen.findByRole("table", { name: "Permanent signal archive" })
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search archive" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Outcome" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Market" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Record type" })).toBeInTheDocument();
    expect(screen.getByText("25 records per page")).toBeInTheDocument();
  });

  it("clears active filters back to the archive defaults", async () => {
    render(<SignalArchivePanel />);
    await screen.findByRole("table", { name: "Permanent signal archive" });

    fireEvent.change(screen.getByRole("combobox", { name: "Outcome" }), {
      target: { value: "correct" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Market" }), {
      target: { value: "1x2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("combobox", { name: "Outcome" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Market" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Record type" })).toHaveValue("settled");
  });

  it("shows a recoverable error and retries the archive request", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("archive offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(archiveResponse),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<SignalArchivePanel />);

    expect(await screen.findByText("Archive unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry archive" }));

    expect(
      await screen.findByRole("table", { name: "Permanent signal archive" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
