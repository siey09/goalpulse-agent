import { TONE_BG, TONE_TEXT, type WidgetTone } from "./tone";

export interface SegmentedGaugeProps {
  label: string;
  /** Formatted display value, e.g. "44". */
  value: string;
  segmentCount?: number;
  /** 0-indexed segment the current value falls in. Clamped to the valid range. */
  activeSegment: number;
  tone?: WidgetTone;
}

/** A ranked-band readout (VO2-max style): which segment of a fixed scale the value falls in, not just the raw number. */
export function SegmentedGauge({ label, value, segmentCount = 5, activeSegment, tone = "accent" }: SegmentedGaugeProps) {
  const clampedActive = Math.min(segmentCount - 1, Math.max(0, activeSegment));

  return (
    <div className="min-w-[104px]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
        <p className={`font-mono text-sm font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {Array.from({ length: segmentCount }).map((_, index) => (
          <span key={index} className={`h-2 flex-1 rounded-full ${index === clampedActive ? TONE_BG[tone] : "bg-white/8"}`} />
        ))}
      </div>
    </div>
  );
}
