import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreamMonitorCard } from "./StreamMonitorCard";

const stream = {
  connected: true,
  lastEventAt: "2026-07-16T07:00:00.000Z",
  totalEventsReceived: 9354,
  totalReconnects: 2,
  lastError: null,
};

describe("StreamMonitorCard", () => {
  it("shows exact streaming evidence", () => {
    render(
      <StreamMonitorCard
        title="TxLINE push stream"
        stream={stream}
        metrics={{ connected: true, staleForMs: 2500, totalReconnects: 2, status: "STREAMING" }}
        isSimulated={false}
      />
    );

    expect(screen.getByRole("heading", { name: "TxLINE push stream" })).toBeInTheDocument();
    expect(screen.getByText("STREAMING")).toBeInTheDocument();
    expect(screen.getByText("9,354")).toBeInTheDocument();
    expect(screen.getByText("2s")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "dd" })).toBeInTheDocument();
  });

  it.each([
    ["STALE", "Stream is stale"],
    ["RECONNECTING", "Network timeout"],
  ] as const)("explains %s stream state", (status, evidence) => {
    render(
      <StreamMonitorCard
        title="Live odds stream"
        stream={{ ...stream, lastError: status === "RECONNECTING" ? "Network timeout" : null }}
        metrics={{ connected: false, staleForMs: 360_000, totalReconnects: 3, status }}
        isSimulated={false}
      />
    );

    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByText(evidence)).toBeInTheDocument();
  });

  it("explains stopped streams in simulated mode", () => {
    render(
      <StreamMonitorCard
        title="TxLINE push stream"
        stream={stream}
        metrics={{ connected: false, staleForMs: null, totalReconnects: 0, status: "STOPPED" }}
        isSimulated
      />
    );

    expect(screen.getByText("Intentionally disabled in simulated mode")).toBeInTheDocument();
  });

  it("does not invent zero counters when stream facts are missing", () => {
    render(<StreamMonitorCard title="Live odds stream" stream={null} metrics={null} isSimulated={false} />);

    expect(screen.getByText("Stream data unavailable")).toBeInTheDocument();
    expect(screen.queryByText("0 events")).not.toBeInTheDocument();
  });

  it("retains exact health counters when metrics are unavailable", () => {
    render(<StreamMonitorCard title="TxLINE push stream" stream={stream} metrics={null} isSimulated={false} />);

    expect(screen.getByText("9,354")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Status data unavailable; health counters retained")).toBeInTheDocument();
  });
});
