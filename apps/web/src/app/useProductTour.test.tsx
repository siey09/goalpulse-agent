import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_STEPS } from "./guideSteps";
import { useProductTour } from "./useProductTour";

describe("useProductTour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '<div id="guide-command-center-overview">Overview</div>';
  });

  it("resumes saved progress and navigates to that step's destination", () => {
    window.localStorage.setItem("goalpulse-product-tour-step", "1");
    const onDestinationChange = vi.fn();

    const { result } = renderHook(() =>
      useProductTour({
        destination: "command-center",
        onDestinationChange,
        replayBacktestReady: false,
        isReplayRunning: false,
        onRunReplayBacktest: vi.fn(),
      })
    );

    act(() => result.current.start());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.currentStep).toBe(GUIDE_STEPS[1]);
    expect(onDestinationChange).toHaveBeenCalledWith(GUIDE_STEPS[1].destination);
  });

  it("supports forward, back, and close without leaving stale progress", () => {
    const onDestinationChange = vi.fn();
    const { result } = renderHook(() =>
      useProductTour({
        destination: "command-center",
        onDestinationChange,
        replayBacktestReady: false,
        isReplayRunning: false,
        onRunReplayBacktest: vi.fn(),
      })
    );

    act(() => result.current.start());
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);

    act(() => result.current.back());
    expect(result.current.stepIndex).toBe(0);

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.stepIndex).toBe(0);
    expect(window.localStorage.getItem("goalpulse-product-tour-step")).toBeNull();
  });
});
