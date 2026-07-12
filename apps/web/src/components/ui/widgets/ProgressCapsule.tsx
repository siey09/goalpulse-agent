import type { ReactNode } from "react";
import { TONE_BG, TONE_TEXT, type WidgetTone } from "./tone";

export interface ProgressCapsuleProps {
  label: string;
  value: number;
  /** Cosmetic display maximum used only to size the fill bar - never clamps the shown value. */
  cap?: number;
  icon?: ReactNode;
  tone?: WidgetTone;
}

/** A quantity read against a soft display cap via a fill bar - the value itself is always the true, unclamped count. */
export function ProgressCapsule({ label, value, cap = 20, icon, tone = "warning" }: ProgressCapsuleProps) {
  const fillPercent = Math.min(100, (value / cap) * 100);

  return (
    <div className="min-w-[104px]">
      <div className="flex items-center gap-2">
        {icon && (
          <span className={TONE_TEXT[tone]} aria-hidden="true">
            {icon}
          </span>
        )}
        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className={`font-mono text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
          <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${fillPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
