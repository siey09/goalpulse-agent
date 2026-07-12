import { TONE_TEXT, type WidgetTone } from "./tone";

export interface RadialDialProps {
  label: string;
  /** Formatted display value, e.g. "98%". */
  value: string;
  /** 0-100, drives the arc fill. */
  percent: number;
  tone?: WidgetTone;
}

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A capacity/health read as a filled arc rather than a bare percentage - the shape itself communicates "how full." */
export function RadialDial({ label, value, percent, tone = "positive" }: RadialDialProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className="flex min-w-[104px] items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={TONE_TEXT[tone]}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
        <p className={`truncate font-mono text-lg font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      </div>
    </div>
  );
}
