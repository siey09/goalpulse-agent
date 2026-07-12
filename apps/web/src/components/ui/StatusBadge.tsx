export type StatusTone = "positive" | "warning" | "danger" | "info" | "neutral" | "accent" | "proof";

const TONE_CLASSES: Record<StatusTone, string> = {
  positive: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-surface-3 text-stone-300",
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  proof: "border-proof/30 bg-proof/10 text-proof",
};

const TONE_DOT: Record<StatusTone, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-stone-400",
  accent: "bg-accent",
  proof: "bg-proof",
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  /** Show a small solid dot before the label - use for live/connection-style states. */
  withDot?: boolean;
}

export function StatusBadge({ label, tone = "neutral", withDot = false }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${TONE_CLASSES[tone]}`}
    >
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />}
      {label}
    </span>
  );
}
