import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignalAuditDrawer } from "./SignalAuditDrawer";
import type { AgentSignal } from "../../types";

const signal: AgentSignal = {
  id: "sig-1",
  matchId: "m1",
  match: "Norway vs England",
  target: "England",
  severity: "HIGH",
  oddsBefore: 2.76,
  oddsAfter: 1.97,
  oddsChangePct: 28.62,
  probabilityPointShiftPct: 14.53,
  createdAt: "2026-07-11T02:25:00.000Z",
  resultStatus: "pending",
  evidence: {
    scoresContext: {
      sequence: 42,
      fieldPressureScore: 30,
      minute: 63,
      scoreline: "1-0",
      reliability: "RELIABLE",
    },
  },
};

const baseProps = {
  signal,
  onClose: vi.fn(),
  onchainVerify: {},
  onVerify: vi.fn(),
  similarSignals: null,
  isSimilarSignalsLoading: false,
  proofHash: undefined,
};

describe("SignalAuditDrawer", () => {
  beforeEach(() => {
    // The drawer fetches /api/arena itself for the strategy-decisions section -
    // mock fetch to a rejected promise so tests exercise the real, already-
    // tested "not yet evaluated" fallback instead of making real network calls.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing when closed (no signal selected)", () => {
    expect(() => render(<SignalAuditDrawer {...baseProps} signal={null} />)).not.toThrow();
  });

  it("renders odds, implied probability, and probability shift for the selected signal", () => {
    render(<SignalAuditDrawer {...baseProps} />);
    expect(screen.getByText("2.76")).toBeInTheDocument();
    expect(screen.getByText("1.97")).toBeInTheDocument();
    expect(screen.getByText("28.62%")).toBeInTheDocument();
    expect(screen.getByText("14.53 pp")).toBeInTheDocument();
  });

  it("renders field and score context when evidence is present", () => {
    render(<SignalAuditDrawer {...baseProps} />);
    expect(screen.getByText("1-0")).toBeInTheDocument();
    expect(screen.getByText("63'")).toBeInTheDocument();
    expect(screen.getByText("RELIABLE")).toBeInTheDocument();
  });

  it("shows an honest fallback instead of fabricating field context when evidence is missing", () => {
    render(<SignalAuditDrawer {...baseProps} signal={{ ...signal, evidence: undefined }} />);
    expect(screen.getByText(/No matching TXODDS Scores event context was available/)).toBeInTheDocument();
  });

  it("shows an honest fallback for the local audit fingerprint when no proofHash is available", () => {
    render(<SignalAuditDrawer {...baseProps} />);
    expect(
      screen.getByText("This signal has not yet been included in a fingerprinted audit run.")
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<SignalAuditDrawer {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalled();
  });
});
