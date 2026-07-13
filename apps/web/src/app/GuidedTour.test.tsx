import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuidedTour } from "./GuidedTour";
import type { GuideStep } from "./guideSteps";

const steps: GuideStep[] = [
  {
    title: "Ingest the feed",
    detail: "See what entered the decision pipeline and why freshness matters.",
    destination: "command-center",
  },
  {
    title: "Verify the conclusion",
    detail: "Inspect the evidence that supports the signal.",
    destination: "verification",
  },
];

describe("GuidedTour", () => {
  it("exposes progress and complete tour controls", () => {
    render(
      <GuidedTour
        steps={steps}
        stepIndex={0}
        position={{ top: 24, left: 24 }}
        onBack={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("dialog", { name: "GoalPulse product tour" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close product tour" })).toBeEnabled();
  });

  it("supports keyboard navigation and Escape-to-close", () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();
    render(
      <GuidedTour
        steps={steps}
        stepIndex={1}
        position={{ top: 24, left: 24 }}
        onBack={onBack}
        onNext={onNext}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Finish tour" })).toBeEnabled();
  });
});
