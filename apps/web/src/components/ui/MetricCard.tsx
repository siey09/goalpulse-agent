import type { ReactNode } from "react";
import { Card } from "./Card";

export type MetricTone = "neutral" | "positive" | "warning" | "danger" | "info";

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: "text-stone-300",
  positive: "text-positive",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

const TONE_ICON_BG: Record<MetricTone, string> = {
  neutral: "bg-stone-500/15",
  positive: "bg-positive/15",
  warning: "bg-warning/15",
  danger: "bg-danger/15",
  info: "bg-info/15",
};

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** Secondary line below the value - e.g. a sample-size caveat. Never render this below 11px; that's the exact bug this component exists to prevent from recurring. */
  caveat?: ReactNode;
  tone?: MetricTone;
  icon?: ReactNode;
  onClick?: () => void;
}

/**
 * A compact KPI card. Tone is caller-decided, not inferred from the raw
 * value - callers are expected to fall back to "neutral" below their own
 * minimum-meaningful-sample threshold rather than color-coding noise as
 * good or bad (see the Accuracy badge fix in commit 8c95775 for why).
 */
export function MetricCard({ label, value, caveat, tone = "neutral", icon, onClick }: MetricCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Card
      className={`flex min-w-[104px] items-center gap-2.5 px-3.5 py-2.5 transition-all ${
        onClick ? "hover:scale-[1.03] cursor-pointer text-left" : ""
      }`}
    >
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className="flex w-full items-center gap-2.5"
      >
        {icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${TONE_ICON_BG[tone]}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.1em] text-stone-500">{label}</p>
          <p className={`truncate text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
          {caveat && <p className="mt-1 text-[11px] leading-tight text-stone-400">{caveat}</p>}
        </div>
      </Wrapper>
    </Card>
  );
}
