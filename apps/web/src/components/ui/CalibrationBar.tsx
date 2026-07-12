export type CalibrationBarTone = "accent" | "positive" | "warning" | "danger" | "info" | "proof";

const TONE_FILL: Record<CalibrationBarTone, string> = {
  accent: "bg-accent",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  proof: "bg-proof",
};

const TONE_MARKER: Record<CalibrationBarTone, string> = {
  accent: "bg-accent shadow-[0_0_0_3px_rgba(255,176,32,0.25)]",
  positive: "bg-positive shadow-[0_0_0_3px_rgba(47,214,180,0.25)]",
  warning: "bg-warning shadow-[0_0_0_3px_rgba(242,193,78,0.25)]",
  danger: "bg-danger shadow-[0_0_0_3px_rgba(255,97,97,0.25)]",
  info: "bg-info shadow-[0_0_0_3px_rgba(90,169,255,0.25)]",
  proof: "bg-proof shadow-[0_0_0_3px_rgba(180,140,255,0.25)]",
};

export interface CalibrationBarProps {
  /** The deterministic threshold this reading is measured against. */
  threshold: number;
  /** The observed magnitude actually recorded. */
  value: number;
  /** Scale ceiling the track represents. Defaults to 2x the threshold, or 1.15x the value if the value alone exceeds that. */
  max?: number;
  tone?: CalibrationBarTone;
  unit?: string;
}

/**
 * GoalPulse's signature reading: a literal gauge showing where an
 * observed value landed against the fixed threshold it crossed (or
 * missed) - the same "rule vs. observation" comparison every signal,
 * confidence score, and calibration check in this product is built on.
 * Not decorative: the marker position and the tick position are both
 * computed from the real numbers passed in, nothing is eyeballed.
 */
export function CalibrationBar({ threshold, value, max, tone = "accent", unit = "%" }: CalibrationBarProps) {
  const scaleMax = max ?? Math.max(threshold * 2, value * 1.15, 1);
  const clamp = (n: number) => Math.min(100, Math.max(0, (n / scaleMax) * 100));
  const thresholdPct = clamp(threshold);
  const valuePct = clamp(value);
  const crossed = value >= threshold;

  return (
    <div className="w-full min-w-[120px]">
      <div className="relative h-1.5 rounded-full bg-surface-3">
        <div
          className={`h-full origin-left rounded-full ${TONE_FILL[tone]} animate-calibration-sweep opacity-70`}
          style={{ width: `${valuePct}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-stone-500"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        />
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full ${TONE_MARKER[tone]}`}
          style={{ left: `${valuePct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-stone-500">
        <span className={crossed ? "text-stone-300" : ""}>
          {value.toFixed(1)}
          {unit}
        </span>
        <span>
          threshold {threshold.toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}
