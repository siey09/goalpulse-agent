import type { ReactNode } from "react";
import { TONE_BG, TONE_BORDER, TONE_TEXT, type WidgetTone } from "./tone";

export interface StatusCapsuleProps {
  label: string;
  value: ReactNode;
  tone?: WidgetTone;
  /** Show a small pulsing dot before the label - use for live/countdown states. */
  pulse?: boolean;
  icon?: ReactNode;
}

/** A live-state readout in its own accent-bordered pill, floating on canvas with no card chrome - matches the reference's countdown-timer tile. */
export function StatusCapsule({ label, value, tone = "accent", pulse = false, icon }: StatusCapsuleProps) {
  return (
    <div className={`flex min-w-[104px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 ${TONE_BORDER[tone]}`}>
      {icon && (
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center ${TONE_TEXT[tone]}`} aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-stone-500">
          {pulse && <span className={`h-1.5 w-1.5 rounded-full ${TONE_BG[tone]} animate-pulse`} aria-hidden="true" />}
          {label}
        </p>
        <p className={`truncate font-mono text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      </div>
    </div>
  );
}
