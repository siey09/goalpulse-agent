import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentScheduler } from "./agentScheduler";

describe("createAgentScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a run to finish before scheduling the next interval", async () => {
    vi.useFakeTimers();
    let finishRun: (() => void) | undefined;
    const run = vi.fn(
      () => new Promise<void>((resolve) => {
        finishRun = resolve;
      })
    );
    const scheduler = createAgentScheduler(run, 5_000);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);

    finishRun?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("cancels a scheduled run when stopped", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const scheduler = createAgentScheduler(run, 5_000);

    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).not.toHaveBeenCalled();
  });
});
