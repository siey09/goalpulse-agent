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
      className={`rounded-2xl border border-border ${
        elevated ? "bg-surface-3" : "bg-surface-2"
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
