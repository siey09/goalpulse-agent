import type { ReactNode } from "react";

export interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  size?: "compact" | "standard" | "primary";
  action?: ReactNode;
}

const SIZE_STYLES = {
  compact: {
    root: "mb-2 gap-3",
    eyebrow: "text-[10px]",
    title: "text-sm",
  },
  standard: {
    root: "mb-3 gap-4",
    eyebrow: "text-[10px]",
    title: "text-lg",
  },
  primary: {
    root: "mb-4 gap-4",
    eyebrow: "text-[11px]",
    title: "text-xl",
  },
} as const;

/** Shared heading group with explicit density variants for workbench and full-page modules. */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  size = "primary",
  action,
}: SectionHeaderProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div
      data-testid="section-header"
      data-size={size}
      className={`${styles.root} flex items-start justify-between`}
    >
      <div>
        <p className={`font-mono ${styles.eyebrow} uppercase tracking-[0.14em] text-stone-500`}>
          {eyebrow}
        </p>
        <h2 className={`font-display ${styles.title} font-bold tracking-tight text-white`}>{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
