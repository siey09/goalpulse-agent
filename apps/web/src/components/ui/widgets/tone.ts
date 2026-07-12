import type { StatusTone } from "../StatusBadge";

export type WidgetTone = StatusTone;

/** Shared per-tone class maps so the seven widget shapes stay derived from the same semantic tokens instead of each hand-rolling its own record. */
export const TONE_TEXT: Record<WidgetTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-stone-300",
  accent: "text-accent-soft",
  proof: "text-proof",
};

export const TONE_BG: Record<WidgetTone, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-stone-400",
  accent: "bg-accent",
  proof: "bg-proof",
};

export const TONE_BORDER: Record<WidgetTone, string> = {
  positive: "border-positive/25",
  warning: "border-warning/25",
  danger: "border-danger/25",
  info: "border-info/25",
  neutral: "border-white/10",
  accent: "border-accent/25",
  proof: "border-proof/25",
};
