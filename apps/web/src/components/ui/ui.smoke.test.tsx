import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card } from "./Card";
import { MetricCard } from "./MetricCard";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { SectionHeader } from "./SectionHeader";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("renders label, value and caveat", () => {
    render(<MetricCard label="Accuracy" value="14%" caveat="n=5 closed" />);
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("14%")).toBeInTheDocument();
    expect(screen.getByText("n=5 closed")).toBeInTheDocument();
  });

  it("calls onClick when interactive", () => {
    const onClick = vi.fn();
    render(<MetricCard label="Signals" value={100} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("StatusBadge", () => {
  it("renders the label", () => {
    render(<StatusBadge label="RUNNING" tone="positive" />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders a specific reason, not a generic placeholder", () => {
    render(<EmptyState reason="No signal crossed the deterministic threshold in this window." />);
    expect(
      screen.getByText("No signal crossed the deterministic threshold in this window.")
    ).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("renders the message and a health link", () => {
    render(<ErrorState message="Unable to load dashboard data." />);
    expect(screen.getByText("Unable to load dashboard data.")).toBeInTheDocument();
    expect(screen.getByText("Check System Health")).toBeInTheDocument();
  });

  it("calls onRetry when provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("SectionHeader", () => {
  it("renders eyebrow and title", () => {
    render(<SectionHeader eyebrow="Calibration check" title="Confidence calibration" />);
    expect(screen.getByText("Calibration check")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confidence calibration" })).toBeInTheDocument();
  });
});
