import { TONE_BG, TONE_TEXT, type WidgetTone } from "./tone";

export interface BarHistogramProps {
  label: string;
  value: number | string;
  /** 0-1 normalized bar heights, oldest first. Falls back to a single flat bar when empty. */
  buckets: number[];
  tone?: WidgetTone;
}

/** A count-over-time readout: the total up front, with a bar-per-bucket row showing recent shape instead of a bare number. */
export function BarHistogram({ label, value, buckets, tone = "accent" }: BarHistogramProps) {
  const safeBuckets = buckets.length > 0 ? buckets : [0];

  return (
    <div className="min-w-[104px]">
      <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`font-mono text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
        <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
          {safeBuckets.map((height, index) => {
            const clamped = Math.min(1, Math.max(0, height));
            return (
              <span
                key={index}
                className={`w-1 rounded-full ${TONE_BG[tone]}`}
                style={{ height: `${Math.max(4, clamped * 24)}px`, opacity: 0.35 + clamped * 0.65 }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
