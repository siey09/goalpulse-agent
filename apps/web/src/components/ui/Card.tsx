import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevated?: boolean;
}

/**
 * Base surface for the Command Center design system. `elevated` picks
 * surface-3 (hover/selected/drawer) instead of surface-2 (default card).
 */
export function Card({ children, elevated = false, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border ${
        elevated ? "bg-surface-3 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.7)]" : "bg-surface-2"
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
