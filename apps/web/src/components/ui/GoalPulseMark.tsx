import { useEffect, useRef } from "react";

export interface GoalPulseMarkProps {
  /** Pixel width of the mark. Height follows the icon's own 230:200 ratio. */
  size?: number;
  /** Skip the draw-in animation for places the mark repeats often (e.g. a nav icon). */
  animate?: boolean;
  className?: string;
}

/**
 * The GoalPulse brand mark: a signal ring broken by a live pulse trace,
 * ending in a "goal reached" dot. Colored via `currentColor`, so wrap it
 * in a `text-accent` (or any text-*) element the same way EmptyState does
 * with its lucide icon.
 *
 * Draws itself in using each path's *real* length via getTotalLength()
 * rather than a guessed stroke-dasharray - a hand-guessed length is the
 * one thing here worth not re-eyeballing, since it's what silently clips
 * part of the ring/pulse if it's ever off.
 */
export function GoalPulseMark({ size = 40, animate = true, className = "" }: GoalPulseMarkProps) {
  const ringRef = useRef<SVGPathElement>(null);
  const pulseRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    const pulse = pulseRef.current;
    if (!ring || !pulse) return;

    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || prefersReducedMotion) return;

    // getTotalLength() isn't implemented in jsdom (throws "not implemented"),
    // so smoke/unit tests render this component too. Degrade to a static,
    // fully-visible mark rather than let that throw during mount.
    try {
      [ring, pulse].forEach((path) => {
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
      });
      ring.getBoundingClientRect(); // force layout so the browser registers the start state first
      requestAnimationFrame(() => {
        ring.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)";
        pulse.style.transition = "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1) 0.3s";
        ring.style.strokeDashoffset = "0";
        pulse.style.strokeDashoffset = "0";
      });
    } catch {
      // Environments without real SVG geometry support (jsdom, some
      // headless renderers) just get the static mark - no crash.
    }
  }, [animate]);

  return (
    <svg
      viewBox="0 0 230 200"
      width={size}
      height={(size * 200) / 230}
      className={className}
      aria-hidden="true"
    >
      {/* Ring: full circle minus a 28deg gap centered on the east point, where the pulse line exits. */}
      <path
        ref={ringRef}
        d="M 165.98,83.55 A 68,68 0 1 1 165.98,116.45"
        fill="none"
        stroke="currentColor"
        strokeWidth={9.5}
        strokeLinecap="round"
      />
      <path
        ref={pulseRef}
        d="M 32,100 L 60,100 L 73,74 L 87,128 L 101,52 L 115,128 L 129,100 L 196,100"
        fill="none"
        stroke="currentColor"
        strokeWidth={9.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={199} cy={100} r={9.5} fill="currentColor" />
    </svg>
  );
}
