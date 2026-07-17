import { useEffect, useState } from "react";
import { GoalPulseMark } from "./GoalPulseMark";

export interface LoadingScreenProps {
  /** Full-viewport takeover (initial boot) vs. an inline panel sized to its
   * container (Suspense fallback, panel refresh). Defaults to inline since
   * that's the more common slot - most call sites already have a shell
   * around them. */
  fullScreen?: boolean;
  /** Override the cycling status copy. Pass a single-item array to disable cycling. */
  messages?: string[];
}

const DEFAULT_MESSAGES = [
  "Connecting to odds stream",
  "Normalizing fixtures",
  "Running signal engine",
  "Auditing evidence chain",
];

/**
 * Branded stand-in for the plain "Loading..." div previously used as the
 * Suspense fallback for lazy-loaded destinations in App.tsx. Mirrors the
 * sidebar wordmark styling exactly (font-display / font-mono + text-accent)
 * so it reads as part of the same product instead of a generic spinner.
 */
export function LoadingScreen({ fullScreen = false, messages = DEFAULT_MESSAGES }: LoadingScreenProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, [messages]);

  return (
    <div
      className={
        fullScreen
          ? "fixed inset-0 z-[100] flex items-center justify-center bg-canvas"
          : "flex items-center justify-center rounded-xl border border-border bg-surface-2 p-10"
      }
      role="status"
      aria-live="polite"
    >
      <div className="animate-fade-in-up flex flex-col items-center gap-4">
        <div className="animate-glow-pulse-amber rounded-full text-accent">
          <GoalPulseMark size={56} />
        </div>

        <div className="text-center">
          <p className="font-display text-lg font-bold tracking-tight text-white">GOALPULSE</p>
          <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-accent">COMMAND CENTER</p>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-stone-500">{messages[index]}</p>

        <div className="relative h-[3px] w-48 overflow-hidden rounded-full bg-surface-3">
          <div className="animate-loading-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
