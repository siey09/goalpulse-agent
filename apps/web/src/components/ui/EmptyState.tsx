import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Always state the specific reason - "no data" is never acceptable copy here. */
  reason: ReactNode;
  action?: ReactNode;
}

/**
 * An empty state must name why the module is empty (no live match, no
 * threshold crossed, no settled sample, no proof available, etc.) - never
 * a generic "no data" placeholder.
 */
export function EmptyState({ reason, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-border bg-black/20 p-4 text-sm text-stone-400">
      <p>{reason}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
