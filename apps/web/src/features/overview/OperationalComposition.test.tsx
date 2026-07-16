import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationalComposition } from "./OperationalComposition";

describe("OperationalComposition", () => {
  it("renders every source count as semantic content", () => {
    render(
      <OperationalComposition
        title="Signal outcomes"
        description="Audited engine decisions"
        items={[
          { id: "confirmed", label: "Confirmed", count: 25, tone: "positive" },
          { id: "rejected", label: "Rejected", count: 54, tone: "danger" },
          { id: "pending", label: "Pending", count: 42, tone: "warning" },
        ]}
        emptyMessage="No signals have entered the audit yet."
        unavailableMessage="Signal audit data unavailable."
        secondaryReadout="32% reported accuracy"
      />
    );

    expect(screen.getByRole("region", { name: "Signal outcomes" })).toBeInTheDocument();
    expect(screen.getByText("121")).toBeInTheDocument();
    expect(screen.getByText("Confirmed").closest("li")).toHaveTextContent("25");
    expect(screen.getByText("Rejected").closest("li")).toHaveTextContent("54");
    expect(screen.getByText("Pending").closest("li")).toHaveTextContent("42");
    expect(screen.getByText("32% reported accuracy")).toBeInTheDocument();
  });

  it("shows the explicit zero state and still exposes an action", () => {
    const onAction = vi.fn();
    render(
      <OperationalComposition
        title="Fixture pipeline"
        description="Current fixture coverage"
        items={[
          { id: "live", label: "Live", count: 0, tone: "positive" },
          { id: "upcoming", label: "Upcoming", count: 0, tone: "info" },
          { id: "finished", label: "Finished", count: 0, tone: "neutral" },
        ]}
        emptyMessage="No fixtures in the current feed."
        unavailableMessage="Fixture data unavailable."
        actionLabel="Open Live Markets"
        onAction={onAction}
      />
    );

    expect(screen.getByText("No fixtures in the current feed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Live Markets" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent("NaN");
  });

  it("distinguishes unavailable data from a real zero", () => {
    render(
      <OperationalComposition
        title="Signal outcomes"
        description="Audited engine decisions"
        items={null}
        emptyMessage="No signals have entered the audit yet."
        unavailableMessage="Signal audit data unavailable."
      />
    );

    expect(screen.getByText("Signal audit data unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("0 total")).not.toBeInTheDocument();
  });

  it("adds reduced-motion protection to animated segments", () => {
    render(
      <OperationalComposition
        title="Fixture pipeline"
        description="Current fixture coverage"
        items={[{ id: "live", label: "Live", count: 1, tone: "positive" }]}
        emptyMessage="No fixtures in the current feed."
        unavailableMessage="Fixture data unavailable."
      />
    );

    expect(screen.getByTestId("composition-segment-live")).toHaveClass("motion-reduce:transition-none");
  });
});
