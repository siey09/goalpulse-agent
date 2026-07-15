import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketEvidenceStrip } from "./MarketEvidenceStrip";

describe("MarketEvidenceStrip", () => {
  it("labels the audit denominator and never renders NaN", () => {
    render(
      <MarketEvidenceStrip
        chartDataCount={0}
        correctSignals={0}
        closedSignals={0}
        health={null}
        fieldContext={{ label: "No field context yet", tone: "neutral" }}
        signalCount={0}
      />
    );

    expect(screen.getByText("0 / 0")).toBeInTheDocument();
    expect(screen.getByText(/confirmed vs closed/i)).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it("shows feed event coverage only for a connected stream", () => {
    const { rerender } = render(
      <MarketEvidenceStrip
        chartDataCount={7}
        correctSignals={2}
        closedSignals={3}
        health={{ liveStream: { connected: true, totalEventsReceived: 42 } }}
        fieldContext={{ label: "Field-backed", tone: "positive" }}
        signalCount={2}
      />
    );

    expect(screen.getByText("42 events")).toBeInTheDocument();
    rerender(
      <MarketEvidenceStrip
        chartDataCount={7}
        correctSignals={2}
        closedSignals={3}
        health={{ liveStream: { connected: false, totalEventsReceived: 42 } }}
        fieldContext={{ label: "Field-backed", tone: "positive" }}
        signalCount={2}
      />
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("42 events")).not.toBeInTheDocument();
  });
});
