import { TONE_BG, TONE_TEXT, type WidgetTone } from "./tone";

export interface DeltaTickerProps {
  label: string;
  value: string;
  delta: string;
  deltaTone?: "positive" | "danger" | "neutral";
  /** 0-1 normalized bar heights, oldest first. Omit to skip the bar row. */
  sparkValues?: number[];
  tone?: WidgetTone;
}

/** A value plus its directional change, with a small bar row underneath for shape - the stock-ticker pattern. */
export function DeltaTicker({ label, value, delta, deltaTone = "positive", sparkValues = [], tone = "accent" }: DeltaTickerProps) {
  return (
    <div className="min-w-[104px]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
        <span className={`font-mono text-[10px] font-semibold ${TONE_TEXT[deltaTone]}`}>{delta}</span>
      </div>
      <p className={`font-mono text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {sparkValues.length > 0 && (
        <div className="mt-1.5 flex h-4 items-end gap-[3px]" aria-hidden="true">
          {sparkValues.map((height, index) => {
            const clamped = Math.min(1, Math.max(0, height));
            return (
              <span
                key={index}
                className={`w-1 rounded-full ${TONE_BG[deltaTone]}`}
                style={{ height: `${Math.max(3, clamped * 16)}px`, opacity: 0.4 + clamped * 0.6 }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
