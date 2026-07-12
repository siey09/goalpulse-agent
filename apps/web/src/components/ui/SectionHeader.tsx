import type { ReactNode } from "react";

export interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}

/** The "small caption above a bold title" pattern already used throughout the app (e.g. "Calibration check" / "Confidence calibration"). */
export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500">{eyebrow}</p>
        <h2 className="font-display text-xl font-bold tracking-tight text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}
