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
        <p className="text-xs text-stone-500">{eyebrow}</p>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}
