type TimerHandle = ReturnType<typeof setTimeout>;

export interface AgentSchedulerTimers {
  setTimeout(callback: () => void, milliseconds: number): TimerHandle;
  clearTimeout(timer: TimerHandle): void;
}

export interface AgentScheduler {
  start(): void;
  stop(): void;
}

const systemTimers: AgentSchedulerTimers = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
};

export function createAgentScheduler(
  run: () => Promise<void>,
  intervalMs: number,
  timers: AgentSchedulerTimers = systemTimers
): AgentScheduler {
  let active = false;
  let timer: TimerHandle | undefined;

  const schedule = () => {
    if (!active) return;
    timer = timers.setTimeout(() => {
      timer = undefined;
      void execute();
    }, intervalMs);
  };

  const execute = async () => {
    if (!active) return;

    try {
      await run();
    } catch (error) {
      console.error("Scheduled agent cycle failed:", error);
    } finally {
      schedule();
    }
  };

  return {
    start() {
      if (active) return;
      active = true;
      schedule();
    },
    stop() {
      active = false;
      if (timer !== undefined) {
        timers.clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
